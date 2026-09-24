import { z } from "zod";
import { nearDuplicateSchema, provenanceSchema, questionTagSchema } from "./questions.js";

/**
 * What a Change Event says happened. Publishing and Rejecting add their own (ADR-0006).
 */
export const changeEventTypes = [
  "question_added",
  "question_edited",
  "near_duplicate_refused",
  "near_duplicate_overridden",
] as const;
export const changeEventTypeSchema = z.enum(changeEventTypes);
export type ChangeEventType = z.infer<typeof changeEventTypeSchema>;

/**
 * The whole content of a Question as it was added. Whole rather than a reference to the
 * Question, because an event has to still say what happened after later edits, and
 * because a refused submission that stored no Question has nothing to point at.
 */
export const questionAddedSchema = z
  .object({
    text: z.string(),
    answerNotes: z.string(),
    provenance: provenanceSchema,
    source: z.string().nullable(),
    tags: z.array(questionTagSchema),
  })
  .strict();
export type QuestionAdded = z.infer<typeof questionAddedSchema>;

/**
 * A submission refused because it closely resembled something already in the bank. The
 * whole attempt is here, Near-Duplicates included, because no Question was stored to point
 * and this row is the only record the attempt ever leaves (ADR-0006).
 */
export const nearDuplicateRefusedSchema = z
  .object({
    attempted: questionAddedSchema,
    nearDuplicates: z.array(nearDuplicateSchema),
  })
  .strict();
export type NearDuplicateRefused = z.infer<typeof nearDuplicateRefusedSchema>;

/**
 * An Author saying a match was wrong and submitting anyway. The Question this names is
 * the one that was stored, and the Viewer on the event is who made the call.
 */
export const nearDuplicateOverriddenSchema = z
  .object({ nearDuplicates: z.array(nearDuplicateSchema) })
  .strict();
export type NearDuplicateOverridden = z.infer<typeof nearDuplicateOverriddenSchema>;

/** One field as it was, and as it became. */
function changedFrom<T extends z.ZodTypeAny>(value: T) {
  return z.object({ before: value, after: value }).strict();
}

/**
 * Only the fields the edit changed, each with what it was and what it became. A field
 * the edit left alone is absent, and so is one it named with the value already there.
 */
export const questionEditedSchema = z
  .object({
    text: changedFrom(z.string()).optional(),
    answerNotes: changedFrom(z.string()).optional(),
    tags: changedFrom(z.array(questionTagSchema)).optional(),
  })
  .strict();
export type QuestionEdited = z.infer<typeof questionEditedSchema>;

/** What every Change Event says, whatever happened: which Question, which Viewer, when. */
const changeEventSchema = z.object({
  id: z.uuid(),
  /** Null for an event about a submission that stored no Question (ADR-0006). */
  questionId: z.uuid().nullable(),
  viewerId: z.uuid(),
  /** Sent because the id is not something a person can read, and the email is the only
   * name a Viewer has (ADR-0035). */
  viewerEmail: z.email(),
  at: z.iso.datetime(),
});

/**
 * A Change Event as the API answers with one. The type and the payload are read together,
 * so a caller that has looked at the type knows the shape of what it is holding.
 */
export const changeEventResponseSchema = z.discriminatedUnion("type", [
  changeEventSchema.extend({ type: z.literal("question_added"), payload: questionAddedSchema }),
  changeEventSchema.extend({ type: z.literal("question_edited"), payload: questionEditedSchema }),
  changeEventSchema.extend({
    type: z.literal("near_duplicate_refused"),
    payload: nearDuplicateRefusedSchema,
  }),
  changeEventSchema.extend({
    type: z.literal("near_duplicate_overridden"),
    payload: nearDuplicateOverriddenSchema,
  }),
]);
export type ChangeEvent = z.infer<typeof changeEventResponseSchema>;

/** The history of one Question, oldest first, because a history is read forwards. */
export const questionHistoryResponseSchema = z
  .object({ events: z.array(changeEventResponseSchema) })
  .strict();
export type QuestionHistoryResponse = z.infer<typeof questionHistoryResponseSchema>;
