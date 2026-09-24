import {
  categoryListResponseSchema,
  categoryNames,
  questionHistoryResponseSchema,
  questionListResponseSchema,
  questionResponseSchema,
  type AddQuestionRequest,
  type ListQuestionsRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callApi } from "@/platform/api-client";
import { stringifySearch } from "@/platform/search-params";

/** Written in one fixed order, so two filters that mean the same thing send the same
 * request and share one cache entry. */
function questionListPath(request: ListQuestionsRequest): string {
  const tags = Object.fromEntries(categoryNames.map((name) => [name, request[name]]));
  const { keywords, limit, offset } = request;
  return `/api/questions${stringifySearch({ ...tags, keywords, limit, offset })}`;
}

/** One request for the Tags, the search and the page, because combining two answers here
 * would be the client deciding what matches. */
export function useQuestionList(request: ListQuestionsRequest | null) {
  const path = request === null ? null : questionListPath(request);
  return useQuery({
    queryKey: ["questions", "list", path],
    queryFn: ({ signal }) => callApi(path!, questionListResponseSchema, { signal }),
    enabled: path !== null,
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

export function useQuestion(id: string) {
  return useQuery({
    queryKey: ["questions", "one", id],
    queryFn: ({ signal }) =>
      callApi(`/api/questions/${encodeURIComponent(id)}`, questionResponseSchema, { signal }),
    select: (answer) => answer.question,
  });
}

export function useQuestionHistory(id: string) {
  return useQuery({
    queryKey: ["questions", "history", id],
    queryFn: ({ signal }) =>
      callApi(`/api/questions/${encodeURIComponent(id)}/history`, questionHistoryResponseSchema, {
        signal,
      }),
    select: (answer) => answer.events,
  });
}

export function useAddQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AddQuestionRequest) =>
      callApi("/api/questions", questionResponseSchema, { method: "POST", body: request }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["questions", "list"] }),
  });
}
