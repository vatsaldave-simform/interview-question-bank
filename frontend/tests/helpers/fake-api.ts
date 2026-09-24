import type { CategoryListResponse, Question } from "@iqb/shared";
import { vi, type Mock } from "vitest";

/** Only ever used to turn the client's relative path into something a `Request` will
 * accept, so a test can read back what was sent. */
const anyOrigin = "http://the-bank.test";

export type FakeApi = {
  fetch: Mock;
  /** What the client sent, in order, as real `Request` objects. */
  sent: Request[];
  /** The same calls as the client wrote them, for the parts a `Request` normalises away. */
  asked: { path: string; init: RequestInit }[];
};

/**
 * Replaces `fetch` for one test. The client is given a real `Response` and its calls are
 * read back as real `Request` objects, so a test cannot pass while the client mishandles
 * a real one.
 */
export function fakeApi(answer: (request: Request) => Response | Promise<Response>): FakeApi {
  const sent: Request[] = [];
  const asked: { path: string; init: RequestInit }[] = [];

  const stub = vi.fn(async (path: string, init: RequestInit = {}) => {
    const request = new Request(new URL(path, anyOrigin), init);
    sent.push(request.clone());
    asked.push({ path, init });
    return answer(request);
  });

  vi.stubGlobal("fetch", stub);
  return { fetch: stub, sent, asked };
}

/** A success, in the shape the API sends one. */
export function answersWith(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A refusal, in the shape `apiErrorSchema` describes. */
export function refusesWith(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(details === undefined ? {} : { details }) } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/** What the API answers a successful login or refresh with. */
export const aSignedInAuthor = {
  accessToken: "a-signed-access-token",
  expiresInSeconds: 900,
  viewer: {
    id: "7c3b4a1e-0000-4000-8000-000000000001",
    email: "author@iqb.test",
    role: "author" as const,
    isAdministrator: false,
  },
};

/** A Question in the shape the API sends one, changed where a test says so. */
export function aQuestion(changes: Partial<Question> = {}): Question {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    text: "What does `satisfies` check that a type annotation does not?",
    answerNotes: "Look for: it checks the value against the type without widening it.",
    authorId: aSignedInAuthor.viewer.id,
    clientId: null,
    publicationState: "published",
    provenance: "original",
    source: null,
    tags: [{ category: "technology", tag: "typescript" }],
    createdAt: "2026-09-01T09:00:00.000Z",
    ...changes,
  };
}

/** What `GET /api/categories` answers with, cut down to what a test needs. */
export const theCategories = {
  categories: [
    { name: "technology", displayName: "Technology", tags: ["node", "react", "typescript"] },
    { name: "seniority", displayName: "Seniority", tags: ["junior", "mid", "senior"] },
    { name: "question-type", displayName: "Question type", tags: ["conceptual", "practical"] },
  ],
} satisfies CategoryListResponse;
