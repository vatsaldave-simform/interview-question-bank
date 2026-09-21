import {
  categoryNames,
  type AddQuestionRequest,
  type CategoryName,
  type ListQuestionsRequest,
  type QuestionTag,
  type Viewer,
} from "@iqb/shared";
import {
  findTagsNamed,
  findVisibleQuestions,
  insertQuestion,
  type QuestionFromDb,
  type TagsInCategory,
} from "./questions.repository.js";
import type { Database } from "../../platform/database.js";
import { InvalidRequestError } from "../../platform/errors.js";

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

/** Named Tags become ids grouped by Category, which is the only shape the query
 * function accepts; it never looks a name up itself (ADR-0003). */
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
  return findVisibleQuestions(database, viewer, {
    tagsPerCategory,
    limit: request.limit,
    offset: request.offset,
  });
}

/** Named Tags become ids; everything else the repository already knows how to do. */
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  request: AddQuestionRequest,
): Promise<QuestionFromDb> {
  const found = await lookUpTagIds(database, request.tags);
  const tagIds = request.tags.map((tag) => idOf(found, tag));
  return insertQuestion(database, viewer, {
    text: request.text,
    answerNotes: request.answerNotes,
    provenance: request.provenance,
    ...(request.source === undefined ? {} : { source: request.source }),
    tagIds,
  });
}
