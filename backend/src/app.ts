import express, { type Express } from "express";
import type { Logger } from "pino";
import type { AccessTokenConfig } from "./features/auth/access-token.js";
import type { Database } from "./platform/database.js";
import type { RateLimitConfig } from "./platform/http/rate-limit.middleware.js";
import { frontendRoutes } from "./platform/http/frontend.routes.js";
import { errorHandler, notFoundHandler } from "./platform/http/error-handler.middleware.js";
import { requestLogging } from "./platform/http/request-logging.middleware.js";
import { apiRoutes } from "./api.routes.js";
import { healthRoutes } from "./platform/http/health.routes.js";

export type AppDependencies = {
  logger: Logger;
  database: Database;
  /** The secret access tokens are signed with, and how long they last (ADR-0008). */
  accessToken: AccessTokenConfig;
  /** How hard a caller may knock on the unauthenticated endpoints (ADR-0021). */
  loginRateLimit: RateLimitConfig;
  /** Proxies in front of the API, which is what makes `req.ip` the caller (ADR-0021). */
  trustProxyHops?: number;
  /**
   * Where the built client lives. Omitted, the API serves no client and every unrouted
   * path is a not_found — how the suite runs, and how `pnpm dev` runs with Vite serving
   * the client itself. Set in the deployed image, where one origin serves both.
   */
  frontendDir?: string;
};

/**
 * The application, with its dependencies passed in rather than imported, so a test
 * can hand it a logger it can read and a client pointed at the test database.
 */
export function createApp({
  logger,
  database,
  accessToken,
  loginRateLimit,
  trustProxyHops = 0,
  frontendDir,
}: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  // A count rather than `true`: trusting every hop would let a caller claim any address
  // in X-Forwarded-For and have a fresh rate-limit allowance per request (ADR-0021).
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);

  // First, so that even a body that fails to parse is logged against a request id.
  app.use(requestLogging(logger));
  app.use(express.json({ limit: "100kb" }));

  // Liveness and readiness stay at the root: they answer the platform, not the
  // application, and Render's health check asks for /health there (ADR-0012).
  app.use(healthRoutes(database));
  app.use("/api", apiRoutes({ database, accessToken, loginRateLimit }));

  // Last, and only ever behind the routes above, so the fallback cannot answer for
  // something the API owns.
  if (frontendDir !== undefined) app.use(frontendRoutes(frontendDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
