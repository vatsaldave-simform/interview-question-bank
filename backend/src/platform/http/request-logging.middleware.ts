import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { runWithRequestContext } from "../request-context.js";

const requestIdHeader = "x-request-id";

/** A caller-supplied id is only honoured if it is short and printable ASCII. */
const acceptableRequestId = /^[\x20-\x7e]{1,200}$/;

function incomingRequestId(header: unknown): string | undefined {
  if (typeof header !== "string") return undefined;
  return acceptableRequestId.test(header) ? header : undefined;
}

/**
 * Runs the rest of the request inside a context carrying its id, so every log line
 * written while handling it names the request. The id also goes back on the response
 * header, which is how a caller correlates a failure with the logs. It is deliberately
 * not in the response body. Two responses that must be indistinguishable cannot carry
 * anything that varies per request.
 */
export function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = incomingRequestId(req.headers[requestIdHeader]) ?? randomUUID();
    const requestLogger = logger.child({ requestId });
    res.setHeader(requestIdHeader, requestId);

    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      requestLogger.info(
        {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 1000) / 1000,
        },
        "request completed",
      );
    });

    runWithRequestContext({ requestId, logger: requestLogger }, next);
  };
}
