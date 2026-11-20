import type { Viewer } from "./auth.js";

/* The API refuses by these, and the page asks the same ones only to hide a button the API
 * would refuse (ADR-0045). */

type Authored = { authorId: string };

/** Whether this Viewer may change this Question's content. Only ever asked about a Question
 * already known to be Visible, which is what makes "a Reviewer may edit any Question" mean any
 * Visible one (ADR-0002). */
export function mayEdit(viewer: Viewer, question: Authored): boolean {
  switch (viewer.role) {
    case "reviewer":
      return true;
    case "author":
      return question.authorId === viewer.id;
    case "reader":
      return false;
  }
}

/** The Author is not asked about, because a Reviewer may Publish their own (ADR-0013). */
export function mayPublish(viewer: Viewer): boolean {
  return viewer.role === "reviewer";
}

/** Whoever may put a Question in the bank may take it out again, its Author included when
 * they are a Reviewer. */
export const mayReturn = mayPublish;

/** The Viewers who may edit it, because an Author Rejecting their own is withdrawing it
 * (ADR-0013). */
export function mayReject(viewer: Viewer, question: Authored): boolean {
  return mayEdit(viewer, question);
}

/** Its own Author only, and only while they may still edit it, since a Question they cannot
 * put right is not theirs to put back in the queue. */
export function mayResubmit(viewer: Viewer, question: Authored): boolean {
  return question.authorId === viewer.id && mayEdit(viewer, question);
}
