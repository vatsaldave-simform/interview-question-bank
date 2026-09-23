import { apiErrorSchema, type ErrorCode } from "@iqb/shared";
import type { ZodType } from "zod";
import { accessToken } from "@/platform/session";

/**
 * A request the API refused, in the shape every error response has. Thrown rather than
 * returned, so a TanStack Query caller surfaces it without checking anything.
 */
export class ApiFailure extends Error {
  /** Zero when no answer arrived at all: the network dropped it, or the free tier is
   * still waking up (ADR-0012). Any other value is what the API replied with. */
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiFailure";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True while the API has said nothing, which is what a cold start looks like. */
  get unanswered(): boolean {
    return this.status === 0;
  }
}

type Sending = {
  method?: "GET" | "POST" | "PATCH";
  /** Serialised as JSON. Left out for a request that carries nothing. */
  body?: unknown;
  signal?: AbortSignal;
};

/** Same-origin in the deployed image and proxied in development, so the cookie travels
 * either way and there is no CORS to configure (ADR-0012). */
function sendingFor({ method = "GET", body, signal }: Sending): RequestInit {
  // Read here rather than passed in by every caller: the token is held in one place and
  // the client is the only thing that sends it (ADR-0030).
  const token = accessToken();
  return {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Null when the body is empty or is not JSON at all, which is what a proxy or a
 * gateway answering instead of the API looks like. */
async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text === "" ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** The API's own words where it sent them. Anything else means something that is not
 * the API answered, and saying so beats reporting its HTML as a message. */
async function refusalFrom(response: Response): Promise<ApiFailure> {
  const answered = apiErrorSchema.safeParse(await jsonOrNull(response));
  if (answered.success) {
    const { code, message, details } = answered.data.error;
    return new ApiFailure(response.status, code, message, details);
  }
  return new ApiFailure(
    response.status,
    "internal_error",
    "The bank answered, but not in a way this client understands.",
  );
}

async function send(path: string, sending: Sending): Promise<Response> {
  // Built before the try, so a mistake in here is never reported as the network being
  // down. The path stays relative: the client is served from the API's own origin.
  const init = sendingFor(sending);
  try {
    return await fetch(path, init);
  } catch (reason) {
    // An aborted request is the caller's own doing — a screen that went away, or a
    // query key that changed — and must not be reported to anyone as a failure.
    if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    throw new ApiFailure(0, "internal_error", "The bank could not be reached.");
  }
}

/**
 * Sends a request and parses the answer with the schema the caller named. Parsed rather
 * than cast: a body that does not match is the client and the API out of sync, which is
 * the failure `@iqb/shared` exists to catch, so it fails here and loudly (ADR-0010).
 */
export async function callApi<Answer>(
  path: string,
  answers: ZodType<Answer>,
  sending: Sending = {},
): Promise<Answer> {
  const response = await send(path, sending);
  if (!response.ok) throw await refusalFrom(response);
  return answers.parse(await jsonOrNull(response));
}

/** For the endpoints that answer 204 and nothing else. A refusal still throws. */
export async function callApiWithoutAnswer(path: string, sending: Sending = {}): Promise<void> {
  const response = await send(path, sending);
  if (!response.ok) throw await refusalFrom(response);
}
