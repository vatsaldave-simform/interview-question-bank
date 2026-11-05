import type { UpvoteSummary, Viewer } from "@iqb/shared";
import { findVisibleQuestionById } from "../questions/questions.repository.ts";
import { removeUpvote, saveUpvote, withUpvoteSummary } from "./upvotes.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError, NotFoundError } from "../../platform/errors.ts";

/** Not Visible is a 404, then the state is a 409, as for every other act on a Question
 * (ADR-0002). There is no rule about who: Readers and the Author may upvote (ADR-0053). */
export async function upvoteQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
): Promise<UpvoteSummary> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();
  if (question.publicationState !== "published") {
    throw new ConflictError("Only a Published Question can be upvoted.");
  }

  // Not locked against a return at the same moment: a returned Question keeps its Upvotes,
  // so one landing an instant late changes nothing.
  await saveUpvote(database, viewer, id);
  return (await withUpvoteSummary(database, viewer, question)).upvotes;
}

/** Allowed in any state, since a returned Question keeps its Upvotes and so its Viewers may
 * still take theirs back. */
export async function takeBackUpvote(
  database: Database,
  viewer: Viewer,
  id: string,
): Promise<UpvoteSummary> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();

  await removeUpvote(database, viewer, id);
  return (await withUpvoteSummary(database, viewer, question)).upvotes;
}
