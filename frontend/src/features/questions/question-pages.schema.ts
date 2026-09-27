import { z } from "zod";

export const questionPageSize = 20;

/** An offset the bank cannot use opens the first page, because there is no filter here to
 * tell the Viewer about. */
export const pageSearchSchema = z.object({
  offset: z.coerce.number().int().min(0).optional().catch(undefined),
});
export type PageSearch = z.infer<typeof pageSearchSchema>;
