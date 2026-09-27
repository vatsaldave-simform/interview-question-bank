import type { Viewer } from "@iqb/shared";
import { mayEdit } from "./may-edit.ts";

/** The Author is not asked about, because a Reviewer may Publish their own (ADR-0013). */
export function mayPublish(viewer: Viewer): boolean {
  return viewer.role === "reviewer";
}

/** The Viewers who may edit it, because an Author Rejecting their own is withdrawing it
 * (ADR-0013). */
export function mayReject(viewer: Viewer, question: { authorId: string }): boolean {
  return mayEdit(viewer, question);
}

/** Its own Author only, and only while they may still edit it, since a Question they cannot
 * put right is not theirs to put back in the queue. */
export function mayResubmit(viewer: Viewer, question: { authorId: string }): boolean {
  return question.authorId === viewer.id && mayEdit(viewer, question);
}
