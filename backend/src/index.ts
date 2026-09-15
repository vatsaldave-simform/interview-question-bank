import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadEnvFile, readEnv } from "./config/env.js";
import { createDatabase } from "./db/prisma.js";
import { createLogger, setRootLogger } from "./logging/logger.js";
import { startServer } from "./server.js";

loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));

const env = readEnv();
const logger = createLogger({ level: env.LOG_LEVEL });
setRootLogger(logger);

const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

const server = await startServer({
  app: createApp({
    logger,
    database,
    ...(env.FRONTEND_DIR === undefined ? {} : { frontendDir: env.FRONTEND_DIR }),
  }),
  port: env.PORT,
  logger,
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  onShutdown: () => database.$disconnect(),
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "signal received");
    void server
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, "shutdown failed");
        process.exit(1);
      });
  });
}

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled rejection");
  process.exit(1);
});
