import {
  questionAddedSchema,
  questionEditedSchema,
  type QuestionAdded,
  type QuestionEdited,
} from "@iqb/shared";
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

/** What a read of the log asks for. Exported because the history is read through the
 * same condition every Question read goes through, which lives next to them (ADR-0003). */
export const changeEventFieldsToRead = {
  id: true,
  questionId: true,
  viewerId: true,
  type: true,
  payload: true,
  createdAt: true,
} satisfies Prisma.ChangeEventSelect;

type ChangeEventRow = Prisma.ChangeEventGetPayload<{ select: typeof changeEventFieldsToRead }>;

/** A Change Event as the rest of the code sees one: its payload is the shape its type
 * says, rather than whatever JSON happens to be in the column. */
export type ChangeEventFromDb = {
  id: string;
  questionId: string | null;
  viewerId: string;
  createdAt: Date;
} & (
  | { type: "question_added"; payload: QuestionAdded }
  | { type: "question_edited"; payload: QuestionEdited }
);

/** Parsed rather than cast, for the reason a Tag's Category is parsed: a payload that
 * does not match its type means the rows and the code are out of sync (ADR-0024). */
export function toChangeEventFromDb(row: ChangeEventRow): ChangeEventFromDb {
  const happened = {
    id: row.id,
    questionId: row.questionId,
    viewerId: row.viewerId,
    createdAt: row.createdAt,
  };
  switch (row.type) {
    case "question_added":
      return { ...happened, type: row.type, payload: questionAddedSchema.parse(row.payload) };
    case "question_edited":
      return { ...happened, type: row.type, payload: questionEditedSchema.parse(row.payload) };
  }
}
