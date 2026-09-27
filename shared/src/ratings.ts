import { z } from "zod";

/** The scale, which the database holds to as well (ADR-0043). */
export const lowestRating = 1;
export const highestRating = 5;

export const ratingValueSchema = z.number().int().min(lowestRating).max(highestRating);

/** Only the value: who is rating is the Viewer the request acts as. */
export const rateQuestionRequestSchema = z.object({ value: ratingValueSchema }).strict();
export type RateQuestionRequest = z.infer<typeof rateQuestionRequestSchema>;

/**
 * What a Question says about its Ratings. Nothing here names who gave one, so the figure stays
 * a signal about the Question and never becomes one about a colleague (CONTEXT.md).
 */
export const ratingSummarySchema = z
  .object({
    /** Null while nobody has rated it, and not rounded: that is for whoever shows it. */
    average: z.number().min(lowestRating).max(highestRating).nullable(),
    count: z.number().int().min(0),
    /** The asking Viewer's own Rating, so a screen can show what they chose. */
    mine: ratingValueSchema.nullable(),
  })
  .strict();
export type RatingSummary = z.infer<typeof ratingSummarySchema>;
