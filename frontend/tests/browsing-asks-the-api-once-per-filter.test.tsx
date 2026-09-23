import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListQuestionsRequest } from "@iqb/shared";
import { browsePageSize } from "@/features/questions/browse.schema";
import { useCategories, useQuestionList } from "@/features/questions/questions.queries";
import { ApiFailure } from "@/platform/api-client";
import { createQueryClient } from "@/platform/query-client";
import { aQuestion, answersWith, fakeApi, refusesWith, theCategories } from "./helpers/fake-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fresh cache per call, so one test's answers are never another's. */
function withAQueryClient() {
  const queryClient = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** A request as the checked address hands one over, with the page filled in. */
function aRequest(changes: Partial<ListQuestionsRequest> = {}): ListQuestionsRequest {
  return { keywords: undefined, limit: browsePageSize, offset: 0, ...changes };
}

function aPage(offset = 0) {
  return { questions: [aQuestion()], limit: browsePageSize, offset };
}

describe("the question list", () => {
  it("sends the Tags, the search and the page in one request", async () => {
    const api = fakeApi(() => answersWith(aPage(20)));
    const request = aRequest({
      technology: ["react", "node"],
      seniority: ["senior"],
      keywords: "cache miss",
      offset: 20,
    });

    const { result } = renderHook(() => useQuestionList(request), { wrapper: withAQueryClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.sent).toHaveLength(1);
    const sent = new URL(api.sent[0]!.url);
    expect(sent.pathname).toBe("/api/questions");
    expect(sent.searchParams.getAll("technology")).toEqual(["react", "node"]);
    expect(sent.searchParams.getAll("seniority")).toEqual(["senior"]);
    expect(sent.searchParams.get("keywords")).toBe("cache miss");
    expect(sent.searchParams.get("limit")).toBe(String(browsePageSize));
    expect(sent.searchParams.get("offset")).toBe("20");
    expect(result.current.data).toEqual(aPage(20));
  });

  it("asks for the first page of the whole bank when nothing is filtered", async () => {
    const api = fakeApi(() => answersWith(aPage()));

    const { result } = renderHook(() => useQuestionList(aRequest()), {
      wrapper: withAQueryClient(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.asked[0]!.path).toBe(`/api/questions?limit=${browsePageSize}&offset=0`);
  });

  it("asks once for two filters that send the same request", async () => {
    const api = fakeApi(() => answersWith(aPage()));

    const { result } = renderHook(
      () => [useQuestionList(aRequest()), useQuestionList(aRequest({ technology: undefined }))],
      { wrapper: withAQueryClient() },
    );
    await waitFor(() => expect(result.current.every((list) => list.isSuccess)).toBe(true));

    expect(api.sent).toHaveLength(1);
  });

  it("reports what the API refused, in the API's own words", async () => {
    fakeApi(() => refusesWith(400, "invalid_request", "There is no Tag called cobol."));

    const { result } = renderHook(() => useQuestionList(aRequest({ technology: ["cobol"] })), {
      wrapper: withAQueryClient(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(ApiFailure);
    expect(result.current.error?.message).toBe("There is no Tag called cobol.");
  });

  it("fails rather than shows a page that is out of step with the shared schema", async () => {
    fakeApi(() => answersWith({ questions: [{ id: "not-a-question" }], limit: 20, offset: 0 }));

    const { result } = renderHook(() => useQuestionList(aRequest()), {
      wrapper: withAQueryClient(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });

  it("asks nothing for an address that was refused before it was sent", async () => {
    const api = fakeApi(() => answersWith(aPage()));

    const { result } = renderHook(() => useQuestionList(null), { wrapper: withAQueryClient() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(api.sent).toHaveLength(0);
  });
});

describe("the Category list", () => {
  it("is read from the API rather than written into the client", async () => {
    const api = fakeApi(() => answersWith(theCategories));

    const { result } = renderHook(() => useCategories(), { wrapper: withAQueryClient() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.asked[0]!.path).toBe("/api/categories");
    expect(result.current.data).toEqual(theCategories.categories);
  });
});
