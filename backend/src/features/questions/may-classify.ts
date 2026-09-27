import type { PublicationState, Viewer } from "@iqb/shared";
import { mayPublish, mayResubmit } from "./may-review.ts";

/** Its own Author only, Reviewers included, because another Viewer's restriction could hide
 * the Question from its Author, which to them is deletion (ADR-0018). */
export const mayClassify = mayResubmit;

/** Only while it is out of the bank, which is how a Question on the wrong Client is fixed
 * (ADR-0018). */
export function mayMoveToAnotherClient(
  viewer: Viewer,
  question: { authorId: string; publicationState: PublicationState },
): boolean {
  return mayClassify(viewer, question) && question.publicationState !== "published";
}

/** A Reviewer's alone, in every Publication State, because it shows the Question to the whole
 * bank (ADR-0018). */
export const mayDeclassify = mayPublish;
