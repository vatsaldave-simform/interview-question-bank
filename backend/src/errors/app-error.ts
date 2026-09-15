import type { ErrorCode } from "@iqb/shared";

/**
 * An error the API is willing to describe to the caller. Everything else becomes a
 * generic `internal_error` at the boundary.
 *
 * An AppError carries a code, never a status. The code-to-status mapping lives in the
 * error middleware alone, so there is one place to read it and one place to change it.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** The request never reached business logic: it was malformed at the edge. */
export class InvalidRequestError extends AppError {
  constructor(message = "The request is not valid.", details?: unknown) {
    super("invalid_request", message, details);
  }
}

/** No authenticated Viewer. Refused before anything else looks at the request. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication is required.") {
    super("unauthenticated", message);
  }
}

/**
 * The Viewer may not do this to something they can see. Only ever raised *after* the
 * visibility gate has passed, or it would reveal that the thing exists (ADR-0002).
 */
export class ForbiddenError extends AppError {
  constructor(message = "You may not do that.") {
    super("forbidden", message);
  }
}

/**
 * The answer for "there is no such thing" and for "there is one, but it is not
 * Visible to you" alike. The two are indistinguishable by design, so this error
 * takes no caller-supplied message: a message that varied would be the leak.
 */
export class NotFoundError extends AppError {
  constructor() {
    super("not_found", "Not found.");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("conflict", message, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests.") {
    super("rate_limited", message);
  }
}
