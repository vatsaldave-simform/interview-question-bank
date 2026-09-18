import { z } from "zod";

/** Where a Question came from. Every Question carries exactly one. */
export const provenances = ["original", "adapted", "inherited"] as const;
export const provenanceSchema = z.enum(provenances);
export type Provenance = z.infer<typeof provenanceSchema>;

/** Whether a Question is awaiting a Reviewer, in the bank, or refused (ADR-0013). */
export const publicationStates = ["pending", "published", "rejected"] as const;
export const publicationStateSchema = z.enum(publicationStates);
export type PublicationState = z.infer<typeof publicationStateSchema>;

/**
 * The Category vocabulary, closed here rather than read from the `categories` table, so
 * that a Tag naming a Category that does not exist is refused at the edge before
 * business logic runs (ADR-0024). Tag values stay rows.
 */
export const categoryNames = ["technology", "seniority", "question-type"] as const;
export const categoryNameSchema = z.enum(categoryNames);
export type CategoryName = z.infer<typeof categoryNameSchema>;

/** A Tag as a request and a response name one: its Category, and its value. */
export const questionTagSchema = z
  .object({ category: categoryNameSchema, tag: z.string().trim().min(1) })
  .strict();
export type QuestionTag = z.infer<typeof questionTagSchema>;

/**
 * A Question as every response describes one. `clientId` is safe to send: a Viewer
 * reading this either holds the Grant for that Client or the Question is unrestricted.
 */
export const questionSchema = z
  .object({
    id: z.uuid(),
    text: z.string(),
    answerNotes: z.string(),
    authorId: z.uuid(),
    clientId: z.uuid().nullable(),
    publicationState: publicationStateSchema,
    provenance: provenanceSchema,
    source: z.string().nullable(),
    tags: z.array(questionTagSchema),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type Question = z.infer<typeof questionSchema>;

export const questionResponseSchema = z.object({ question: questionSchema }).strict();
export type QuestionResponse = z.infer<typeof questionResponseSchema>;

/**
 * What an Author submits. Text and Answer Notes are trimmed before they are measured,
 * so whitespace alone is empty; Provenance is required and closed, which is what makes
 * a missing or unknown one a refusal at the edge rather than a decision further in.
 */
export const addQuestionRequestSchema = z
  .object({
    text: z.string().trim().min(1),
    answerNotes: z.string().trim().min(1),
    provenance: provenanceSchema,
    source: z.string().trim().min(1).optional(),
    tags: z.array(questionTagSchema).default([]),
  })
  .strict();
export type AddQuestionRequest = z.infer<typeof addQuestionRequestSchema>;
