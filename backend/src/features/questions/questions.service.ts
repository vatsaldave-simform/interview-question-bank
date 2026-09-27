import {
  categoryNames,
  type AddQuestionRequest,
  type CategoryName,
  type EditQuestionRequest,
  type ListQuestionsRequest,
  type NearDuplicate,
  type NearDuplicateRefused,
  type NearDuplicatesFound,
  type PublishQuestionRequest,
  type QuestionTag,
  type UnknownTags,
  type Viewer,
} from "@iqb/shared";
import {
  findNearDuplicates,
  findNearDuplicatesForPublication,
  findTagsNamed,
  findVisibleQuestionById,
  findVisibleQuestions,
  insertQuestion,
  moveVisibleQuestion,
  recordRefusedAsNearDuplicate,
  searchVisibleQuestions,
  updateVisibleQuestion,
  type PublicationMove,
  type QuestionFromDb,
  type TagsInCategory,
} from "./questions.repository.ts";
import { mayEdit } from "./may-edit.ts";
import { mayPublish, mayReject, mayResubmit, mayReturn } from "./may-review.ts";
import type { Database } from "../../platform/database.ts";
import {
  ConflictError,
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
} from "../../platform/errors.ts";

/** The spelling both sides of the lookup agree on. */
const tagKey = (category: string, tag: string): string => `${category}/${tag}`;

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

/** A miss cannot happen: `lookUpTagIds` refused the request that would cause one. */
function idOf(found: ReadonlyMap<string, string>, { category, tag }: QuestionTag): string {
  const id = found.get(tagKey(category, tag));
  if (id === undefined) throw new Error(`The Tag ${tagKey(category, tag)} was never looked up.`);
  return id;
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

/** The named Tags as ids, in the order they were named. */
async function tagIdsNamed(
  database: Database,
  tags: readonly QuestionTag[],
): Promise<string[]> {
  const found = await lookUpTagIds(database, tags);
  return tags.map((tag) => idOf(found, tag));
}

/** What a 409 says, by the act detection refused. */
const refusedAsNearDuplicateFor = {
  add:
    "This Question closely resembles one already in the bank. Submit it again " +
    "confirming it is genuinely different if that is wrong.",
  publish:
    "This Question closely resembles one already in the bank or waiting to be reviewed. " +
    "Publish it again confirming it is genuinely different if that is wrong.",
} as const;

type RefusedAsNearDuplicate = {
  act: keyof typeof refusedAsNearDuplicateFor;
  /** Null when the act would have stored the Question, so there is none yet to name. */
  questionId: string | null;
  refused: NearDuplicateRefused;
  confirmed: boolean;
};

/** The Near-Duplicates a confirmation overrides, which is every one found. Without a
 * confirmation, any match is recorded and refused, and nothing else happens. */
async function overrideOrRefuse(
  database: Database,
  viewer: Viewer,
  { act, questionId, refused, confirmed }: RefusedAsNearDuplicate,
): Promise<NearDuplicate[]> {
  const { nearDuplicates } = refused;
  if (nearDuplicates.length === 0 || confirmed) return nearDuplicates;

  await recordRefusedAsNearDuplicate(database, viewer, questionId, refused);
  const found: NearDuplicatesFound = { nearDuplicates };
  throw new ConflictError(refusedAsNearDuplicateFor[act], found);
}

/** Detection runs before anything is stored, so an Author hears about a Near-Duplicate
 * while the Question is still in front of them (ADR-0014). */
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  request: AddQuestionRequest,
): Promise<QuestionFromDb> {
  const tagIds = await tagIdsNamed(database, request.tags);
  const overridden = await overrideOrRefuse(database, viewer, {
    act: "add",
    questionId: null,
    refused: {
      attempted: {
        text: request.text,
        answerNotes: request.answerNotes,
        provenance: request.provenance,
        source: request.source ?? null,
        tags: [...request.tags],
      },
      nearDuplicates: await findNearDuplicates(database, viewer, request.text),
    },
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
      tagIds,
    },
    overridden,
  );
}

/**
 * The order here is the rule. The Question is looked up through the same function every
 * read goes through, so an id that is not Visible is answered as one that names nothing;
 * only then does the role rule run, and only then is its 403 honest (ADR-0002).
 */
export async function editQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  request: EditQuestionRequest,
): Promise<QuestionFromDb> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();
  if (!mayEdit(viewer, question)) throw new ForbiddenError();

  const tagIds = request.tags === undefined ? undefined : await tagIdsNamed(database, request.tags);

  const edited = await updateVisibleQuestion(database, viewer, id, {
    ...(request.text === undefined ? {} : { text: request.text }),
    ...(request.answerNotes === undefined ? {} : { answerNotes: request.answerNotes }),
    ...(tagIds === undefined ? {} : { tagIds }),
  });
  // A Permission Grant can be revoked between the look-up and the write, and a write
  // that no longer reaches the Question answers as a missing one rather than raising.
  if (edited === null) throw new NotFoundError();
  return edited;
}

/** What a 409 says, by the act that found the Question in the wrong state. */
const refusedFor: Record<PublicationMove["act"], string> = {
  publish: "Only a Pending Question can be Published.",
  reject: "Only a Pending Question can be Rejected.",
  resubmit: "Only a Rejected Question can be resubmitted.",
  return: "Only a Published Question can be returned.",
};

/** What an act overrides once detection has looked at the Question it is about. */
type NearDuplicateCheck = (question: QuestionFromDb) => Promise<NearDuplicate[]>;

/** Nothing to override, for every act detection does not run on. */
const noNearDuplicateCheck: NearDuplicateCheck = async () => [];

/** In the order `editQuestion` checks, for the same reason: not Visible is a 404, then the
 * role rule is a 403, and only then can the state be wrong, as a 409 (ADR-0002). */
async function moveQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  move: PublicationMove,
  mayMove: (viewer: Viewer, question: QuestionFromDb) => boolean,
  checkNearDuplicates: NearDuplicateCheck = noNearDuplicateCheck,
): Promise<QuestionFromDb> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();
  if (!mayMove(viewer, question)) throw new ForbiddenError();

  const overridden = await checkNearDuplicates(question);
  const moved = await moveVisibleQuestion(database, viewer, id, move, overridden);
  if (moved !== null) return moved;
  // Asked again because a Permission Grant revoked since the first look makes it a 404.
  if ((await findVisibleQuestionById(database, viewer, id)) === null) throw new NotFoundError();
  throw new ConflictError(refusedFor[move.act]);
}

export function publishQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  request: PublishQuestionRequest,
): Promise<QuestionFromDb> {
  return moveQuestion(database, viewer, id, { act: "publish" }, mayPublish, async (question) => {
    // A Question that is not Pending cannot be Published, and hearing that is more use
    // than a list of matches for an act that would fail anyway.
    if (question.publicationState !== "pending") return [];
    return overrideOrRefuse(database, viewer, {
      act: "publish",
      questionId: question.id,
      refused: {
        attempted: {
          text: question.text,
          answerNotes: question.answerNotes,
          provenance: question.provenance,
          source: question.source,
          tags: question.tags,
        },
        nearDuplicates: await findNearDuplicatesForPublication(database, viewer, question),
      },
      confirmed: request.confirmedNotANearDuplicate,
    });
  });
}

export function rejectQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  reason: string,
): Promise<QuestionFromDb> {
  return moveQuestion(database, viewer, id, { act: "reject", reason }, mayReject);
}

/** Its own act, because an edit alone leaves a Rejected Question where it is (ADR-0013). */
export function resubmitQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
): Promise<QuestionFromDb> {
  return moveQuestion(database, viewer, id, { act: "resubmit" }, mayResubmit);
}

export function returnQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  reason: string,
): Promise<QuestionFromDb> {
  return moveQuestion(database, viewer, id, { act: "return", reason }, mayReturn);
}
