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
