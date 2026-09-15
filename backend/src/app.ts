import express, { type Express } from "express";
import type { Logger } from "pino";
import type { Database } from "./db/prisma.js";
import { frontendRoutes } from "./http/frontend.js";
import { errorHandler, notFoundHandler } from "./http/error-handler.js";
import { requestLogging } from "./http/request-logging.js";
import { apiRoutes } from "./routes/api.js";
import { healthRoutes } from "./routes/health.js";

export type AppDependencies = {
  logger: Logger;
  database: Database;
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
export function createApp({ logger, database, frontendDir }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");

  // First, so that even a body that fails to parse is logged against a request id.
  app.use(requestLogging(logger));
  app.use(express.json({ limit: "100kb" }));

  // Liveness and readiness stay at the root: they answer the platform, not the
  // application, and Render's health check asks for /health there (ADR-0012).
  app.use(healthRoutes(database));
  app.use("/api", apiRoutes());

  // Last, and only ever behind the routes above, so the fallback cannot answer for
  // something the API owns.
  if (frontendDir !== undefined) app.use(frontendRoutes(frontendDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
