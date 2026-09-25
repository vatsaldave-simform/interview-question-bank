import express, { type Express } from "express";
import type { Logger } from "pino";
import cookieParser from "cookie-parser";
import type { AccessTokenConfig } from "./features/auth/access-token.ts";
import type { PasswordLinkConfig } from "./features/auth/password-link.ts";
import type { RefreshCookieConfig } from "./features/auth/refresh-cookie.ts";
import type { RefreshTokenConfig } from "./features/auth/refresh-token.ts";
import type { Database } from "./platform/database.ts";
import type { Mailer } from "./platform/mail.ts";
import type { RateLimitConfig } from "./platform/http/rate-limit.middleware.ts";
import { frontendRoutes } from "./platform/http/frontend.routes.ts";
import { errorHandler, notFoundHandler } from "./platform/http/error-handler.middleware.ts";
import { requestLogging } from "./platform/http/request-logging.middleware.ts";
import { apiRoutes } from "./api.routes.ts";
import { healthRoutes } from "./platform/http/health.routes.ts";

export type AppDependencies = {
  logger: Logger;
  database: Database;
  /** The secret access tokens are signed with, and how long they last (ADR-0008). */
  accessToken: AccessTokenConfig;
  /** How hard a caller may knock on the unauthenticated endpoints (ADR-0021). */
  authRateLimit: RateLimitConfig;
  /** How long a session survives being away from it (ADR-0008). */
  refreshToken: RefreshTokenConfig;
  /** Whether the cookie carrying it is marked Secure. */
  refreshCookie: RefreshCookieConfig;
  /** Passed in like the database, so the suite can read what would have been sent. */
  mailer: Mailer;
  setPasswordLink: PasswordLinkConfig;
  passwordResetLink: PasswordLinkConfig;
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
  authRateLimit,
  refreshToken,
  refreshCookie,
  mailer,
  setPasswordLink,
  passwordResetLink,
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
  // Only the auth routes read a cookie, but parsing is cheap and mounting it there
  // instead would put one middleware's reach out of step with this file's order.
  app.use(cookieParser());

  // Liveness and readiness stay at the root: they answer the platform, not the
  // application, and Render's health check asks for /health there (ADR-0012).
  app.use(healthRoutes(database));
  app.use(
    "/api",
    apiRoutes({
      database,
      accessToken,
      authRateLimit,
      refreshToken,
      refreshCookie,
      setPasswordMail: { mailer, settings: setPasswordLink },
      passwordResetMail: { mailer, settings: passwordResetLink },
    }),
  );

  // Last, and only ever behind the routes above, so the fallback cannot answer for
  // something the API owns.
  if (frontendDir !== undefined) app.use(frontendRoutes(frontendDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
