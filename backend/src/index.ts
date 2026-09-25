import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { loadEnvFile, readEnv } from "./platform/env.ts";
import { createDatabase } from "./platform/database.ts";
import { createLogger, setRootLogger } from "./platform/logger.ts";
import { createSmtpMailer } from "./platform/mail.ts";
import { startServer } from "./platform/server.ts";

loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));

const env = readEnv();
const logger = createLogger({ level: env.LOG_LEVEL });
setRootLogger(logger);

const database = createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });

const server = await startServer({
  app: createApp({
    logger,
    database,
    accessToken: {
      secret: env.ACCESS_TOKEN_SECRET,
      lifetimeSeconds: env.ACCESS_TOKEN_LIFETIME_SECONDS,
    },
    authRateLimit: {
      maxAttempts: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
      windowSeconds: env.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    },
    refreshToken: { lifetimeSeconds: env.REFRESH_TOKEN_LIFETIME_SECONDS },
    refreshCookie: { secure: env.REFRESH_COOKIE_SECURE },
    mailer: createSmtpMailer({
      url: env.MAIL_URL,
      from: env.MAIL_FROM,
      requireTls: env.MAIL_REQUIRE_TLS,
    }),
    trustProxyHops: env.TRUST_PROXY_HOPS,
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
