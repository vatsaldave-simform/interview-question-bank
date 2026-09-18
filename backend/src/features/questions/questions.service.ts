import type { AddQuestionRequest, QuestionTag, Viewer } from "@iqb/shared";
import { findTagsNamed, insertQuestion, type StoredQuestion } from "./questions.repository.js";
import type { Database } from "../../platform/database.js";
import { InvalidRequestError } from "../../platform/errors.js";

/** The spelling both sides of the lookup agree on. */
const tagKey = (category: string, tag: string): string => `${category}/${tag}`;

/**
 * A Tag naming a Category that does not exist was refused by the request schema
 * (ADR-0024); what is left is a value no Tag in that Category holds, which only the
 * database can answer.
 */
async function tagIdsFor(database: Database, tags: QuestionTag[]): Promise<string[]> {
  const found = new Map(
    (await findTagsNamed(database, tags)).map((row) => [tagKey(row.category, row.tag), row.id]),
  );

  const ids: string[] = [];
  const unknown: string[] = [];
  for (const { category, tag } of tags) {
    const id = found.get(tagKey(category, tag));
    if (id === undefined) unknown.push(tagKey(category, tag));
    else ids.push(id);
  }
  if (unknown.length > 0) throw new InvalidRequestError("No such Tag.", { tags: unknown });

  return ids;
}

/** Named Tags become ids; everything else the repository already knows how to do. */
export async function addQuestion(
  database: Database,
  viewer: Viewer,
  request: AddQuestionRequest,
): Promise<StoredQuestion> {
  const tagIds = await tagIdsFor(database, request.tags);
  return insertQuestion(database, viewer, {
    text: request.text,
    answerNotes: request.answerNotes,
    provenance: request.provenance,
    ...(request.source === undefined ? {} : { source: request.source }),
    tagIds,
  });
}
