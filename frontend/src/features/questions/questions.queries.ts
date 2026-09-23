import { categoryListResponseSchema, categoryNames, questionListResponseSchema } from "@iqb/shared";
import { useQuery } from "@tanstack/react-query";
import type { BrowseSearch } from "@/features/questions/browse.schema";
import { callApi } from "@/platform/api-client";
import { stringifySearch } from "@/platform/search-params";

export const browsePageSize = 20;

/** Written in one fixed order, so two filters that mean the same thing send the same
 * request and share one cache entry. */
function questionListPath(search: BrowseSearch): string {
  const tags = Object.fromEntries(categoryNames.map((name) => [name, search[name]]));
  const page = { limit: browsePageSize, offset: search.offset ?? 0 };
  return `/api/questions${stringifySearch({ ...tags, keywords: search.keywords, ...page })}`;
}

/** One request for the Tags, the search and the page, because combining two answers here
 * would be the client deciding what matches. */
export function useQuestionList(search: BrowseSearch) {
  const path = questionListPath(search);
  return useQuery({
    queryKey: ["questions", "list", path],
    queryFn: ({ signal }) => callApi(path, questionListResponseSchema, { signal }),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => callApi("/api/categories", categoryListResponseSchema, { signal }),
    select: (answer) => answer.categories,
    // Tags change when someone seeds new ones, not while a Viewer is browsing.
    staleTime: Infinity,
  });
}
