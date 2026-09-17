import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { RateLimitedError } from "../errors.js";
import { log } from "../logger.js";

export type RateLimitConfig = {
  windowSeconds: number;
  maxAttempts: number;
};

/**
 * Counts per caller address, in this process rather than in a cache, because the
 * service runs as a single instance (ADR-0009).
 */
export function limitRequests({ windowSeconds, maxAttempts }: RateLimitConfig): RequestHandler {
  return rateLimit({
    windowMs: windowSeconds * 1_000,
    limit: maxAttempts,
    // Only failures count, so a Viewer signing in over and over is never locked out of
    // their own account by having succeeded (ADR-0021).
    skipSuccessfulRequests: true,
    // The standard headers and no others, so a client that means well can back off on
    // what they say rather than on a 429 it did not see coming.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      log().warn("rate limit reached");
      // Raised rather than answered here, so the one error middleware decides the
      // status and the body, as it does for every other refusal.
      next(new RateLimitedError());
    },
  });
}
