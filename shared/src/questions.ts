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
