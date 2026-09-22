import {
  categoryNames,
  type AddQuestionRequest,
  type CategoryName,
  type EditQuestionRequest,
  type ListQuestionsRequest,
  type NearDuplicatesFound,
  type QuestionTag,
  type Viewer,
} from "@iqb/shared";
import {
  findNearDuplicates,
  findTagsNamed,
  findVisibleQuestionById,
  findVisibleQuestions,
  insertQuestion,
  recordRefusedSubmission,
  searchVisibleQuestions,
  updateVisibleQuestion,
  type QuestionFromDb,
  type TagsInCategory,
} from "./questions.repository.js";
import { mayEdit } from "./may-edit.js";
import type { Database } from "../../platform/database.js";
import {
  ConflictError,
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
} from "../../platform/errors.js";

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
  if (unknown.length > 0) throw new InvalidRequestError("No such Tag.", { tags: unknown });

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

/** Detection runs before anything is stored, so an Author hears about a Near-Duplicate
 * while the Question is still in front of them (ADR-0014). */
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  request: AddQuestionRequest,
): Promise<QuestionFromDb> {
  const tagIds = await tagIdsNamed(database, request.tags);
  const nearDuplicates = await findNearDuplicates(database, viewer, request.text);

  if (nearDuplicates.length > 0 && !request.confirmedNotANearDuplicate) {
    await recordRefusedSubmission(database, viewer, {
      attempted: {
        text: request.text,
        answerNotes: request.answerNotes,
        provenance: request.provenance,
        source: request.source ?? null,
        tags: [...request.tags],
      },
      nearDuplicates,
    });
    const found: NearDuplicatesFound = { nearDuplicates };
    throw new ConflictError(
      "This Question closely resembles one already in the bank. Submit it again " +
        "confirming it is genuinely different if that is wrong.",
      found,
    );
  }

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
    nearDuplicates,
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
