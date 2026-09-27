import type { RatingSummary, Viewer } from "@iqb/shared";
import { findVisibleQuestionById } from "../questions/questions.repository.ts";
import { mayRate } from "./may-rate.ts";
import { saveRating, withRatingSummary } from "./ratings.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../platform/errors.ts";

/**
 * In the order every act on a Question checks: not Visible is a 404, then the rule is a 403,
 * then the state is a 409 (ADR-0002). A Reader cannot reach another Viewer's Pending Question,
 * so for them it is a 404 like a missing one.
 */
export async function rateQuestion(
  database: Database,
  viewer: Viewer,
  id: string,
  value: number,
): Promise<RatingSummary> {
  const question = await findVisibleQuestionById(database, viewer, id);
  if (question === null) throw new NotFoundError();
  if (!mayRate(viewer, question)) throw new ForbiddenError("You cannot rate your own Question.");
  if (question.publicationState !== "published") {
    throw new ConflictError("Only a Published Question can be rated.");
  }

  // Not locked against a return at the same moment: Ratings given while it was Published
  // stay on it once it is returned, so one landing an instant late changes nothing.
  await saveRating(database, viewer, id, value);
  return (await withRatingSummary(database, viewer, question)).rating;
}
