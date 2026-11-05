import { z } from "zod";

/** Names nobody who gave an Upvote, so it stays a signal about the Question and not about a
 * colleague (CONTEXT.md). */
export const upvoteSummarySchema = z
  .object({
    count: z.number().int().min(0),
    /** Whether the asking Viewer has given one, so a screen can show it as given. */
    mine: z.boolean(),
  })
  .strict();
export type UpvoteSummary = z.infer<typeof upvoteSummarySchema>;

/** The summary alone, since an Upvote changes nothing about the Question it is about. */
export const upvoteResponseSchema = z.object({ upvotes: upvoteSummarySchema }).strict();
export type UpvoteResponse = z.infer<typeof upvoteResponseSchema>;
