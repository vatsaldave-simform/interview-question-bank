import {
  categoryNames,
  listQuestionsRequestSchema,
  type CategoryName,
  type ListQuestionsRequest,
} from "@iqb/shared";
import { z } from "zod";

export const browsePageSize = 20;

/** What any one name in the address can hold: one value, or the same name repeated. */
const addressValueSchema = z.union([z.string(), z.array(z.string())]).optional();

const addressValuePerCategory = Object.fromEntries(
  categoryNames.map((name) => [name, addressValueSchema]),
) as Record<CategoryName, typeof addressValueSchema>;

/** The browse address as it arrived, kept whole so that `listRequestFor` can refuse what
 * the API would refuse rather than this schema quietly dropping it. */
export const browseSearchSchema = z.looseObject({
  ...addressValuePerCategory,
  keywords: addressValueSchema,
  offset: z.union([z.number(), z.string(), z.array(z.string())]).optional(),
});
export type BrowseSearch = z.infer<typeof browseSearchSchema>;

/** The Tags the address names in one Category, however many times it names them. */
export function tagsIn(search: BrowseSearch, category: CategoryName): string[] {
  return [search[category] ?? []].flat();
}

export type ListRequestFromAddress = { request: ListQuestionsRequest } | { problem: string };

/** Checks the address with the API's own schema, so a misspelled Category is refused
 * here rather than sent as a request for the whole bank (ADR-0024). */
export function listRequestFor(search: BrowseSearch): ListRequestFromAddress {
  const checked = listQuestionsRequestSchema.safeParse({ ...search, limit: browsePageSize });
  if (checked.success) return { request: checked.data };

  const [issue] = checked.error.issues;
  if (issue?.code === "unrecognized_keys") {
    return { problem: `The address names ${issue.keys.join(" and ")}, which is not a filter.` };
  }
  return { problem: `The address gives ${String(issue?.path[0])} a value the bank cannot use.` };
}
