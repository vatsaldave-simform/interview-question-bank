import {
  categoryNames,
  mayEdit,
  mayMoveToAnotherClient,
  mayPublish,
  mayReject,
  mayRemoveRestriction,
  mayRestrict,
  mayResubmit,
  mayReturn,
  type AddQuestionRequest,
  type CategoryName,
  type EditQuestionRequest,
  type ListQuestionsRequest,
  type NearDuplicate,
  type NearDuplicatesFound,
  type PublishQuestionRequest,
  type QuestionAdded,
  type QuestionTag,
  type RejectQuestionRequest,
  type RestrictQuestionRequest,
  type ReturnQuestionRequest,
  type UnknownTags,
  type Viewer,
} from "@iqb/shared";
import {
  findNearDuplicates,
  findNearDuplicatesForEdit,
  findNearDuplicatesForPublication,
  findTagsNamed,
  findVisibleQuestionById,
  findVisibleQuestions,
  insertQuestion,
  recordRefusedAsNearDuplicate,
  searchVisibleQuestions,
  writeVisibleQuestion,
  type QuestionFromDb,
  type QuestionWrite,
  type TagsInCategory,
  type WriteRefused,
} from "./questions.repository.ts";
import { findClientById } from "../clients/clients.repository.ts";
import type { Database } from "../../platform/database.ts";
import {
  ConflictError,
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
  type AppError,
} from "../../platform/errors.ts";

/** Detection runs before anything is stored, so an Author hears about a Near-Duplicate
 * while the Question is still in front of them (ADR-0014). */
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  request: AddQuestionRequest,
): Promise<QuestionFromDb> {
  const tagIds = await tagIdsNamed(database, request.tags);
  if (request.clientId !== undefined) await checkClientExists(database, request.clientId);
  const overridden = await refuseUnlessConfirmed(database, viewer, {
    act: "add",
    questionId: null,
    attempted: {
      text: request.text,
      answerNotes: request.answerNotes,
      provenance: request.provenance,
      source: request.source ?? null,
      tags: [...request.tags],
    },
    nearDuplicates: await findNearDuplicates(database, request.text),
    confirmed: request.confirmedNotANearDuplicate,
  });

  return insertQuestion(
    database,
    viewer,
    {
      text: request.text,
      answerNotes: request.answerNotes,
      provenance: request.provenance,
      ...(request.source === undefined ? {} : { source: request.source }),
      ...(request.clientId === undefined ? {} : { clientId: request.clientId }),
      tagIds,
    },
    overridden,
  );
}

/** Named Tags become ids grouped by Category, which is the only shape either query
 * function accepts; neither looks a name up itself (ADR-0003). */
export async function listQuestions(
  database: Database,
  viewer: Viewer,
  request: ListQuestionsRequest,
): Promise<QuestionFromDb[]> {
  const named = namedPerCategory(request);
  const found = await lookUpTagIds(
    database,
    named.flatMap(({ tags }) => tags),
  );

  const tagsPerCategory: TagsInCategory[] = named.map(({ category, tags }) => ({
    category,
    tagIds: tags.map((named) => idOf(found, named)),
  }));
  const page = { tagsPerCategory, limit: request.limit, offset: request.offset };

  // Keywords change the order as well as the answer: most relevant first rather than
  // newest first (ADR-0026).

  if (request.keywords === undefined) return findVisibleQuestions(database, viewer, page);
  return searchVisibleQuestions(database, viewer, { ...page, keywords: request.keywords });
}

/** Not Visible is a 404 before the role rule runs, because a 403 would say the Question
 * exists (ADR-0002). */
export async function actOnQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  act: QuestionAct,
): Promise<QuestionFromDb> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();
  const rule = actRules[writeActFor(act, question)];
  if (!rule.may(viewer, question)) throw new ForbiddenError(rule.forbidden);

  const prepared = await prepareWrite(database, viewer, question, act);
  if (prepared === null) return question;

  const written = await writeVisibleQuestion(
    database,
    viewer,
    id,
    prepared.write,
    prepared.overridden,
  );
  if ("refused" in written) throw refusal(written.refused, rule.wrongState);
  return written.question;
}

/** The named Tags as ids, in the order they were named. */
async function tagIdsNamed(
  database: Database,
  tags: readonly QuestionTag[],
): Promise<string[]> {
  const found = await lookUpTagIds(database, tags);
  return tags.map((tag) => idOf(found, tag));
}

/**
 * Every named Tag's id, by the name it was named with. A Tag naming a Category that
 * does not exist was refused by the request schema (ADR-0024); what is left is a value
 * no Tag in that Category holds, which only the database can answer.
 */
async function lookUpTagIds(
  database: Database,
  tags: readonly QuestionTag[],
): Promise<ReadonlyMap<string, string>> {
  const found = new Map(
    (await findTagsNamed(database, tags)).map((row) => [tagKey(row.category, row.tag), row.id]),
  );

  const unknown = tags
    .map(({ category, tag }) => tagKey(category, tag))
    .filter((named) => !found.has(named));
  if (unknown.length > 0) {
    const details: UnknownTags = { tags: unknown };
    throw new InvalidRequestError("No such Tag.", details);
  }

  return found;
}

/** The spelling both sides of the lookup agree on. */
function tagKey(category: string, tag: string): string {
  return `${category}/${tag}`;
}

/** A miss cannot happen: `lookUpTagIds` refused the request that would cause one. */
function idOf(found: ReadonlyMap<string, string>, { category, tag }: QuestionTag): string {
  const id = found.get(tagKey(category, tag));
  if (id === undefined) throw new Error(`The Tag ${tagKey(category, tag)} was never looked up.`);
  return id;
}

/** Any Viewer may name any Client, because a Client hides nothing (ADR-0050). */
async function checkClientExists(database: Database, clientId: string): Promise<void> {
  if ((await findClientById(database, clientId)) === null) {
    throw new InvalidRequestError("No such Client.");
  }
}

async function refuseUnlessConfirmed(
  database: Database,
  viewer: Viewer,
  { act, questionId, attempted, nearDuplicates, confirmed }: CheckedText,
): Promise<NearDuplicate[]> {
  if (nearDuplicates.length === 0 || confirmed) return nearDuplicates;

  await recordRefusedAsNearDuplicate(database, viewer, questionId, { attempted, nearDuplicates });
  const found: NearDuplicatesFound = { nearDuplicates };
  throw new ConflictError(refusedAsNearDuplicateFor[act], found);
}

/** The Categories the request named, each with the Tag values under it. A Category it
 * left out adds no condition rather than an empty one. */
function namedPerCategory(
  request: ListQuestionsRequest,
): { category: CategoryName; tags: QuestionTag[] }[] {
  return categoryNames
    .map((category) => ({
      category,
      tags: (request[category] ?? []).map((tag) => ({ category, tag })),
    }))
    .filter(({ tags }) => tags.length > 0);
}

/** Which write an act becomes. Restricting a Question that already has a Client moves it. */
function writeActFor(act: QuestionAct, question: QuestionFromDb): QuestionWrite["act"] {
  if (act.act !== "restrict") return act.act;
  return question.clientId === null ? "restrict" : "move";
}

/** Null when there is nothing to write. */
async function prepareWrite(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
  act: QuestionAct,
): Promise<PreparedWrite | null> {
  switch (act.act) {
    case "edit":
      return editFor(database, viewer, question, act);
    case "publish":
      return publicationFor(database, viewer, question, act);
    case "reject":
    case "return":
      return { write: { act: act.act, reason: act.reason }, overridden: [] };
    case "resubmit":
      return { write: { act: "resubmit" }, overridden: [] };
    case "restrict":
      return restrictionFor(database, viewer, question, act.clientId);
    case "remove-restriction":
      if (question.clientId === null) {
        throw new ConflictError("This Question has no Client restriction to remove.");
      }
      return { write: { act: "remove-restriction", from: question.clientId }, overridden: [] };
  }
}

async function editFor(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
  request: EditQuestionRequest,
): Promise<PreparedWrite> {
  const tagIds = request.tags === undefined ? undefined : await tagIdsNamed(database, request.tags);
  const overridden = await checkEditedText(database, viewer, question, request);
  return {
    write: {
      act: "edit",
      ...(request.text === undefined ? {} : { text: request.text }),
      ...(request.answerNotes === undefined ? {} : { answerNotes: request.answerNotes }),
      ...(tagIds === undefined ? {} : { tagIds }),
    },
    overridden,
  };
}

/** Only new text on a Published Question, because a Pending one's text is checked when it is
 * Published (ADR-0014). */
async function checkEditedText(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
  request: EditQuestionRequest,
): Promise<NearDuplicate[]> {
  const { text } = request;
  if (question.publicationState !== "published" || text === undefined || text === question.text) {
    return [];
  }

  return refuseUnlessConfirmed(database, viewer, {
    act: "edit",
    questionId: question.id,
    attempted: questionAfter(question, request),
    nearDuplicates: await findNearDuplicatesForEdit(database, { id: question.id, text }),
    confirmed: request.confirmedNotANearDuplicate === true,
  });
}

/** A stored Question as a refusal records it, with whatever the refused act was changing. */
function questionAfter(
  question: QuestionFromDb,
  changes: Pick<EditQuestionRequest, "text" | "answerNotes" | "tags"> = {},
): QuestionAdded {
  return {
    text: changes.text ?? question.text,
    answerNotes: changes.answerNotes ?? question.answerNotes,
    provenance: question.provenance,
    source: question.source,
    tags: changes.tags ?? question.tags,
  };
}

async function publicationFor(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
  request: PublishQuestionRequest,
): Promise<PreparedWrite> {
  const write: QuestionWrite = { act: "publish" };
  // A Question that is not Pending cannot be Published, and hearing that is more use
  // than a list of Near-Duplicates for an act that would fail anyway.
  if (question.publicationState !== "pending") return { write, overridden: [] };

  const overridden = await refuseUnlessConfirmed(database, viewer, {
    act: "publish",
    questionId: question.id,
    attempted: questionAfter(question),
    nearDuplicates: await findNearDuplicatesForPublication(database, question),
    confirmed: request.confirmedNotANearDuplicate,
  });
  return { write, overridden };
}

/** Null when it is already restricted to that Client, which changes nothing and records
 * nothing. */
async function restrictionFor(
  database: Database,
  viewer: Viewer,
  question: QuestionFromDb,
  clientId: string,
): Promise<PreparedWrite | null> {
  await checkClientExists(database, clientId);

  if (question.clientId === null) return { write: { act: "restrict", clientId }, overridden: [] };
  if (question.clientId === clientId) return null;
  // After the Client, because the advice is only worth giving when the move could then work.
  if (!mayMoveToAnotherClient(viewer, question)) {
    throw new ForbiddenError(
      "A Published Question cannot be moved to another Client. A Reviewer can return it to " +
        "you, and you can move it then.",
    );
  }
  return { write: { act: "move", from: question.clientId, to: clientId }, overridden: [] };
}

function refusal(refused: WriteRefused, wrongState: string): AppError {
  switch (refused) {
    case "not-visible":
      return new NotFoundError();
    case "wrong-state":
      return new ConflictError(wrongState);
  }
}

/** What a 409 says, by the act detection refused. */
const refusedAsNearDuplicateFor = {
  add:
    "This Question closely resembles one already in the bank. Submit it again " +
    "confirming it is genuinely different if that is wrong.",
  publish:
    "This Question closely resembles one already in the bank or waiting to be reviewed. " +
    "Publish it again confirming it is genuinely different if that is wrong.",
  edit:
    "This text closely resembles a Question already in the bank. Save it again " +
    "confirming it is genuinely different if that is wrong.",
} as const;

/** The text one act wrote, and what detection found beside it. */
type CheckedText = {
  act: keyof typeof refusedAsNearDuplicateFor;
  /** Null when the act would have stored the Question, so there is none yet to name. */
  questionId: string | null;
  attempted: QuestionAdded;
  nearDuplicates: NearDuplicate[];
  confirmed: boolean;
};

type QuestionAct =
  | ({ act: "edit" } & EditQuestionRequest)
  | ({ act: "publish" } & PublishQuestionRequest)
  | ({ act: "reject" } & RejectQuestionRequest)
  // Its own act, because an edit alone leaves a Rejected Question where it is (ADR-0013).
  | { act: "resubmit" }
  | ({ act: "return" } & ReturnQuestionRequest)
  | ({ act: "restrict" } & RestrictQuestionRequest)
  // Its own act rather than a restrict naming no Client, because only a Reviewer may do it
  // (ADR-0018).
  | { act: "remove-restriction" };

type ActRule = {
  may: (viewer: Viewer, question: QuestionFromDb) => boolean;
  /** Said with the 403, where a bare refusal would leave the Viewer guessing. */
  forbidden?: string;
  /** Said with the 409 when the write finds the Question changed since the look-up. */
  wrongState: string;
};

const restrictionChanged = "This Question's Client restriction changed meanwhile. Load it again.";

/** One row per write, so a missing one does not compile. */
const actRules: Record<QuestionWrite["act"], ActRule> = {
  // Never said today, because an edit starts from any state.
  edit: { may: mayEdit, wrongState: "This Question changed meanwhile. Load it again." },
  publish: { may: mayPublish, wrongState: "Only a Pending Question can be Published." },
  reject: { may: mayReject, wrongState: "Only a Pending Question can be Rejected." },
  resubmit: { may: mayResubmit, wrongState: "Only a Rejected Question can be resubmitted." },
  return: { may: mayReturn, wrongState: "Only a Published Question can be returned." },
  restrict: { may: mayRestrict, wrongState: restrictionChanged },
  // Whether it may leave its Client is asked further in, in `restrictionFor`.
  move: {
    may: mayRestrict,
    wrongState:
      "This Question's Client restriction or Publication State changed meanwhile. Load it again.",
  },
  "remove-restriction": {
    may: mayRemoveRestriction,
    forbidden: "Only a Reviewer may remove a Client restriction.",
    wrongState: restrictionChanged,
  },
};

type PreparedWrite = { write: QuestionWrite; overridden: NearDuplicate[] };
