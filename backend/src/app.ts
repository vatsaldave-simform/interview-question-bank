import express, { type Express } from "express";
import type { Logger } from "pino";
import type { Database } from "./db/prisma.js";
import { errorHandler, notFoundHandler } from "./http/error-handler.js";
import { requestLogging } from "./http/request-logging.js";
import { healthRoutes } from "./routes/health.js";

export type AppDependencies = {
  logger: Logger;
  database: Database;
};

/**
 * The application, with its dependencies passed in rather than imported, so a test
 * can hand it a logger it can read and a client pointed at the test database.
 */
export function createApp({ logger, database }: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");

  // First, so that even a body that fails to parse is logged against a request id.
  app.use(requestLogging(logger));
  app.use(express.json({ limit: "100kb" }));

  app.use(healthRoutes(database));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
