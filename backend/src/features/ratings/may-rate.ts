import type { Viewer } from "@iqb/shared";

/** A Viewer of any role may not rate a Question they wrote, because the average would then
 * count their opinion of their own work. */
export function mayRate(viewer: Viewer, question: { authorId: string }): boolean {
  return question.authorId !== viewer.id;
}
