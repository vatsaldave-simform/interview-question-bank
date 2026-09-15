import { apiErrorSchema, type ApiError, type ErrorCode } from "@iqb/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { AppError, InvalidRequestError, NotFoundError } from "../errors/app-error.js";
import { log } from "../logging/logger.js";

/**
 * The whole mapping, in one place. Route handlers raise errors and never set a status
 * code for one, so this table is the only thing that decides what a caller sees.
 */
const statusByCode: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

/** Anything reaching the caller as an unrecognised failure says only this. */
const internalErrorMessage = "Something went wrong.";

type BodyParserError = SyntaxError & { status?: number; body?: unknown };

function isBodyParserError(error: unknown): error is BodyParserError {
  return error instanceof SyntaxError && "body" in error;
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError) {
    return new InvalidRequestError("The request is not valid.", z.treeifyError(error));
  }
  if (isBodyParserError(error)) return new InvalidRequestError("The request body is not valid JSON.");
  return new AppError("internal_error", internalErrorMessage);
}

/** Unknown route. Answered with the same body as any other `not_found`. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const appError = toAppError(error);
  const status = statusByCode[appError.code];

  if (appError.code === "internal_error") {
    log().error({ err: error }, "request failed");
  } else {
    log().debug({ code: appError.code, status }, "request refused");
  }

  // Something already started writing. Nothing useful can be sent, so end the
  // response rather than crash on a second write.
  if (res.headersSent) {
    next(error);
    return;
  }

  const body: ApiError = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  };

  res.status(status).json(apiErrorSchema.parse(body));
};
