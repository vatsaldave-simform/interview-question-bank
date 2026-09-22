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

/** A Tag value as a request writes one, trimmed before it is measured. */
const tagValueSchema = z.string().trim().min(1);

/** A Tag as a request and a response name one: its Category, and its value. */
export const questionTagSchema = z
  .object({ category: categoryNameSchema, tag: tagValueSchema })
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

/**
 * What an edit names: the parts it leaves out stay as they are, and Tags are replaced
 * whole. Strict, so an edit reaching for the Publication State or the Client is refused
 * at the edge, because moving a Question between States and widening its restriction are
 * a Reviewer's acts rather than edits (ADR-0013, ADR-0018).
 */
export const editQuestionRequestSchema = z
  .object({
    text: z.string().trim().min(1).optional(),
    answerNotes: z.string().trim().min(1).optional(),
    tags: z.array(questionTagSchema).optional(),
  })
  .strict()
  .refine((request) => Object.values(request).some((named) => named !== undefined), {
    message: "An edit names at least one of text, answerNotes or tags.",
  });
export type EditQuestionRequest = z.infer<typeof editQuestionRequestSchema>;

/** The page a request gets when it asks for no particular size. */
export const defaultQuestionPageSize = 50;

/** The most a caller may ask for at once. A request above it is refused rather than
 * shrunk, because a page that is silently not the one you asked for is worse than a
 * refusal you can read. */
export const maxQuestionPageSize = 100;

/** Long enough for anything a person types and short enough that nobody sends a
 * document. A request above it is refused, for the reason a page above the cap is. */
export const maxKeywordsLength = 200;

/** A Category names its Tag values by repeating the parameter, so one value and several
 * arrive in different shapes and both mean the same thing. */
const tagValuesSchema = z
  .union([tagValueSchema, z.array(tagValueSchema).min(1)])
  .transform((named) => (Array.isArray(named) ? named : [named]));

/** One optional parameter per Category, built from the closed list so that a Category
 * added to it is filterable without a second edit here (ADR-0024). */
const tagValuesPerCategory = Object.fromEntries(
  categoryNames.map((name) => [name, tagValuesSchema.optional()]),
) as Record<CategoryName, z.ZodOptional<typeof tagValuesSchema>>;

/**
 * The filter as a URL carries it: `?technology=typescript&technology=react&seniority=senior`,
 * with `&keywords=cache` to search as well. Repeats within one parameter are the OR and
 * separate parameters are the AND, so the URL says what the rule is. Strict, which is what
 * refuses an unknown Category at the edge with no database lookup (ADR-0025).
 */
export const listQuestionsRequestSchema = z
  .object({
    ...tagValuesPerCategory,
    /** Absent and empty mean the same thing, so `?keywords=` alone asks for the whole
     * bank rather than for nothing. */
    keywords: z
      .string()
      .trim()
      .max(maxKeywordsLength)
      .optional()
      .transform((typed) => (typed === "" ? undefined : typed)),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(maxQuestionPageSize)
      .default(defaultQuestionPageSize),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ListQuestionsRequest = z.infer<typeof listQuestionsRequestSchema>;

/** The page, and the page it is. A caller that named no `limit` cannot otherwise tell
 * which one it got. */
export const questionListResponseSchema = z
  .object({
    questions: z.array(questionSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().min(0),
  })
  .strict();
export type QuestionListResponse = z.infer<typeof questionListResponseSchema>;
