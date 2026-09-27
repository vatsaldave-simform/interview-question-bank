import type { Viewer } from "@iqb/shared";

/** Whoever wrote it, whatever their role, so the signal is never self-served. Only ever asked
 * about a Question already known to be Visible (ADR-0002). */
export function mayRate(viewer: Viewer, question: { authorId: string }): boolean {
  return question.authorId !== viewer.id;
}
