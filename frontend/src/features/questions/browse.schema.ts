import { categoryNames, type CategoryName } from "@iqb/shared";
import { z } from "zod";

/** A blank value is a box nobody filled in, so it means the same as leaving it out. */
function blankIsAbsent(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** One Tag and several arrive in different shapes from the address, and mean the same. */
const tagValuesSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((named) => {
    const values = [named].flat().flatMap((value) => blankIsAbsent(value) ?? []);
    return values.length === 0 ? undefined : values;
  })
  .optional();

const tagValuesPerCategory = Object.fromEntries(
  categoryNames.map((name) => [name, tagValuesSchema]),
) as Record<CategoryName, typeof tagValuesSchema>;

/**
 * The filter the browse screen is showing, as its address carries it. Something that is
 * not a filter is dropped, since it changes nothing about which Questions match. An
 * unknown Tag or an over-long search is kept for the API to refuse: dropping it would
 * quietly show more than the Viewer asked for.
 */
export const browseSearchSchema = z.object({
  ...tagValuesPerCategory,
  keywords: z.string().transform(blankIsAbsent).optional(),
  offset: z.coerce.number<string | number>().int().min(0).optional().catch(undefined),
});
export type BrowseSearch = z.infer<typeof browseSearchSchema>;
