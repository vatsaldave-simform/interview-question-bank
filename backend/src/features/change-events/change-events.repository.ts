import {
  changeEventKinds,
  changeEventResponseSchema,
  changeEventTypes,
  type ChangeEvent,
  type ChangeEventType,
  type Viewer,
} from "@iqb/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import type { DatabaseOrTransaction } from "../../platform/database.ts";

/** The type and the payload travel together, so an edit's before and after cannot be
 * filed as an addition. Whether a Question may be named comes from the type's entry in
 * the table in `@iqb/shared`. */
export type ChangeEventToInsert = {
  [Type in ChangeEventType]: {
    type: Type;
    payload: Extract<ChangeEvent, { type: Type }>["payload"];
  } & QuestionOf[(typeof changeEventKinds)[Type]["question"]];
}[ChangeEventType];

/**
 * The history of one Question, oldest first. The caller has already checked that `viewer`
 * may see the Question, because this reads the log by id and nothing here looks at
 * visibility (ADR-0003).
 */
export async function findEventsOfQuestion(
  database: DatabaseOrTransaction,
  viewer: Viewer,
  questionId: string,
): Promise<ChangeEvent[]> {
  const rows = await database.changeEvent.findMany({
    // Being able to see a Question is not being able to see what its Author was warned
    // about: those events name Questions of their own (ADR-0028).
    where: {
      questionId,
      OR: [{ type: { notIn: typesThatNameAnotherQuestion } }, { viewerId: viewer.id }],
    },
    // The time comes from the process that wrote the event, so two events can share
    // one; the id settles that, and the order is at least the same every read.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: changeEventFieldsToRead,
  });
  // Parsed rather than cast, for the reason a Tag's Category is parsed: a payload that
  // does not match its type means the rows and the code are out of sync (ADR-0024).
  return rows.map(({ createdAt, viewer: { email }, ...row }) =>
    changeEventResponseSchema.parse({ ...row, viewerEmail: email, at: createdAt.toISOString() }),
  );
}

/** `viewer` is the Viewer who did it. */
export async function insertChangeEvent(
  database: DatabaseOrTransaction,
  viewer: Viewer,
  event: ChangeEventToInsert,
): Promise<void> {
  // Refused here, because the log is append-only and a wrong payload could not be fixed
  // afterwards (ADR-0027).
  changeEventKinds[event.type].payload.parse(event.payload);
  await database.changeEvent.create({
    data: {
      questionId: event.questionId ?? null,
      viewerId: viewer.id,
      type: event.type,
      payload: event.payload,
    },
  });
}

/** What each kind of event says about its Question, as the caller must write it. */
type QuestionOf = {
  required: { questionId: string };
  never: { questionId?: undefined };
  optional: { questionId: string | null };
};

const typesThatNameAnotherQuestion = changeEventTypes.filter(
  (type) => changeEventKinds[type].namesAnotherQuestion,
);

const changeEventFieldsToRead = {
  id: true,
  questionId: true,
  viewerId: true,
  viewer: { select: { email: true } },
  type: true,
  payload: true,
  createdAt: true,
} satisfies Prisma.ChangeEventSelect;
