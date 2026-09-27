import { z } from "zod";

/** How many Questions a screen asks the API for at once. */
export const questionPageSize = 20;

/** The address of a list that only pages. An offset the bank cannot use opens the first
 * page, because there is no filter here to tell the Viewer about. */
export const pageSearchSchema = z.object({
  offset: z.coerce.number().int().min(0).optional().catch(undefined),
});
export type PageSearch = z.infer<typeof pageSearchSchema>;
