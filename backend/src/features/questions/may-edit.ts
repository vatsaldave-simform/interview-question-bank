import type { Viewer } from "@iqb/shared";

/** Whether this Viewer may change this Question's content. Only ever asked about a
 * Question already known to be Visible, which is what makes "a Reviewer may edit any
 * Question" mean any Visible one (ADR-0002). */
export function mayEdit(viewer: Viewer, question: { authorId: string }): boolean {
  switch (viewer.role) {
    case "reviewer":
      return true;
    case "author":
      return question.authorId === viewer.id;
    case "reader":
      return false;
  }
}
