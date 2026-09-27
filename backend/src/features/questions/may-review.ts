import type { Viewer } from "@iqb/shared";
import { mayEdit } from "./may-edit.ts";

/** Whether this Viewer may Publish this Question. A Reviewer may Publish their own, so the
 * Author does not matter here (ADR-0013). Only ever asked about a Visible Question. */
export function mayPublish(viewer: Viewer): boolean {
  return viewer.role === "reviewer";
}

/** The same Viewers who may edit it: any Reviewer, and its own Author, for whom Rejecting
 * is how they withdraw it (ADR-0013). */
export function mayReject(viewer: Viewer, question: { authorId: string }): boolean {
  return mayEdit(viewer, question);
}

/** Only its own Author, since resubmitting is saying the Question is ready again, and only
 * one who may still edit it: a Question they cannot put right is not theirs to requeue. */
export function mayResubmit(viewer: Viewer, question: { authorId: string }): boolean {
  return question.authorId === viewer.id && mayEdit(viewer, question);
}
