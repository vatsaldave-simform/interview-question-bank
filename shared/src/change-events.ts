import { z } from "zod";
import { provenanceSchema, questionTagSchema } from "./questions.js";

/**
 * What a Change Event says happened. Two values so far, because two things write one;
 * Publishing, Rejecting and refusing a Near-Duplicate add their own (ADR-0006).
 */
export const changeEventTypes = ["question_added", "question_edited"] as const;
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
