import {
  categoryListResponseSchema,
  categoryNames,
  questionHistoryResponseSchema,
  questionListResponseSchema,
  questionResponseSchema,
  ratingResponseSchema,
  type AddQuestionRequest,
  type ClassifyQuestionRequest,
  type EditQuestionRequest,
  type ListQuestionsRequest,
  type PublishQuestionRequest,
  type QuestionResponse,
  type RateQuestionRequest,
  type RejectQuestionRequest,
  type ReturnQuestionRequest,
} from "@iqb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { questionPageSize } from "@/features/questions/question-pages.schema";
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

export function useReviewQueue(offset: number) {
  const path = `/api/questions/pending${stringifySearch({ limit: questionPageSize, offset })}`;
  return useQuery({
    queryKey: ["questions", "pending", offset],
    queryFn: ({ signal }) => callApi(path, questionListResponseSchema, { signal }),
  });
}

export function useOwnQuestions(offset: number) {
  const path = `/api/questions/own${stringifySearch({ limit: questionPageSize, offset })}`;
  return useQuery({
    queryKey: ["questions", "own", offset],
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

export function useEditQuestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: EditQuestionRequest) =>
      callApi(`/api/questions/${encodeURIComponent(id)}`, questionResponseSchema, {
        method: "PATCH",
        body: request,
      }),
    onSuccess: async (answer) => {
      // The answer is the Question as it now is, so there is nothing to ask for again.
      queryClient.setQueryData(["questions", "one", id], answer);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["questions", "history", id] }),
        queryClient.invalidateQueries({ queryKey: ["questions", "list"] }),
      ]);
    },
  });
}

export type PublicationMove =
  | { act: "publish"; request: PublishQuestionRequest }
  | { act: "reject"; request: RejectQuestionRequest }
  | { act: "return"; request: ReturnQuestionRequest }
  | { act: "resubmit" };

export function useMoveQuestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (move: PublicationMove) =>
      callApi(`/api/questions/${encodeURIComponent(id)}/${move.act}`, questionResponseSchema, {
        method: "POST",
        body: "request" in move ? move.request : undefined,
      }),
    onSuccess: (answer) => queryClient.setQueryData(["questions", "one", id], answer),
    // After a refusal too, because a 409 means someone else moved it first, and every list
    // holding it is out of date either way.
    onSettled: (answer) =>
      queryClient.invalidateQueries({
        queryKey: ["questions"],
        // An answer is the Question as it now is, so it is not asked for again.
        predicate: ({ queryKey }) =>
          answer === undefined || queryKey[1] !== "one" || queryKey[2] !== id,
      }),
  });
}

/** Removing is its own act rather than a classify naming no Client, because only a Reviewer
 * may do it (ADR-0018). */
export type RestrictionChange =
  | { act: "classify"; request: ClassifyQuestionRequest }
  | { act: "declassify" };

export function useChangeRestriction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: RestrictionChange) =>
      callApi(`/api/questions/${encodeURIComponent(id)}/${change.act}`, questionResponseSchema, {
        method: "POST",
        body: "request" in change ? change.request : undefined,
      }),
    onSuccess: (answer) => queryClient.setQueryData(["questions", "one", id], answer),
    // After a refusal too, because it can mean someone else changed the restriction first.
    onSettled: (answer) =>
      queryClient.invalidateQueries({
        queryKey: ["questions"],
        // An answer is the Question as it now is, so it is not asked for again.
        predicate: ({ queryKey }) =>
          answer === undefined || queryKey[1] !== "one" || queryKey[2] !== id,
      }),
  });
}

export function useRateQuestion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RateQuestionRequest) =>
      callApi(`/api/questions/${encodeURIComponent(id)}/rating`, ratingResponseSchema, {
        method: "PUT",
        body: request,
      }),
    onSuccess: async ({ rating }) => {
      // Only the summary changes, and a Rating writes no Change Event, so the history
      // stays as it is (ADR-0043).
      queryClient.setQueryData<QuestionResponse>(["questions", "one", id], (held) =>
        held === undefined ? held : { question: { ...held.question, rating } },
      );
      await queryClient.invalidateQueries({ queryKey: ["questions", "list"] });
    },
    // A refusal can mean the Question was returned or hidden since the page loaded.
    onError: () => queryClient.invalidateQueries({ queryKey: ["questions", "one", id] }),
  });
}
