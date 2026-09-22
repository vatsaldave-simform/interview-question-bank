import type { QuestionAdded, QuestionEdited } from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Database } from "../../platform/database.js";

/**
 * The database, or the transaction a change is already running in. An event is written
 * beside the change it describes, so that neither can happen without the other.
 */
export type WhereTheChangeIsBeingWritten = Database | Prisma.TransactionClient;

/**
 * An event about to be written. The type and the payload travel together, so an edit's
 * before-and-after cannot be filed as an addition.
 *
 * An addition names no Question when the submission stored none, which is the case
 * ADR-0006 exists for; an edit always has one to name.
 */
export type NewChangeEvent =
  | {
      type: "question_added";
      questionId: string | null;
      viewerId: string;
      payload: QuestionAdded;
    }
  | {
      type: "question_edited";
      questionId: string;
      viewerId: string;
      payload: QuestionEdited;
    };

/** The time is the database's, not this process's, so events from two machines still
 * sort against each other. */
export async function insertChangeEvent(
  database: WhereTheChangeIsBeingWritten,
  event: NewChangeEvent,
): Promise<void> {
  await database.changeEvent.create({
    data: {
      questionId: event.questionId,
      viewerId: event.viewerId,
      type: event.type,
      payload: event.payload,
    },
  });
}
