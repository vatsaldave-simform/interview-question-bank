import type { Logger } from "pino";
import { createApp } from "../../src/app.js";
import type { AccessTokenConfig } from "../../src/features/auth/access-token.js";
import type { Database } from "../../src/platform/database.js";
import type { RefreshCookieConfig } from "../../src/features/auth/refresh-cookie.js";
import type { RefreshTokenConfig } from "../../src/features/auth/refresh-token.js";
import type { RateLimitConfig } from "../../src/platform/http/rate-limit.middleware.js";
import { createLogger } from "../../src/platform/logger.js";
import { startServer, type RunningServer } from "../../src/platform/server.js";
import { testAccessTokenSecret } from "./auth.js";
import { createSqlLoggingDatabase, createTestDatabase, truncateAll } from "./test-database.js";

export type LogLine = Record<string, unknown> & { requestId?: string; msg?: string };

export type TestApi = {
  /** Issues a real HTTP request against the running API. */
  request: (path: string, init?: RequestInit) => Promise<Response>;
  database: Database;
  /** Everything the API has logged since the last `forgetLogs()`. */
  logLines: () => LogLine[];
  forgetLogs: () => void;
  /** Every statement the API has sent, for a test proving something never reached the
   * database. Empty unless `recordSql` was asked for. */
  statements: () => string[];
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Starts the real application on an ephemeral port, backed by the test database. Tests
 * then observe it the way a caller does, over HTTP, which is the only place the
 * guarantees this project cares about can honestly be asserted.
 */
export async function startTestApi(
  options: {
    applicationName?: string;
    frontendDir?: string;
    /** Overrides for the token configuration the environment would supply. */
    accessToken?: Partial<AccessTokenConfig>;
    /** Overrides for the rate limit the environment would supply. */
    authRateLimit?: Partial<RateLimitConfig>;
    /** Overrides for the refresh token's lifetime, for a test that expires one. */
    refreshToken?: Partial<RefreshTokenConfig>;
    /** Overrides for the cookie, for the test that asserts it is marked Secure. */
    refreshCookie?: Partial<RefreshCookieConfig>;
    /** Proxies to trust, for a test that presents an X-Forwarded-For of its own. */
    trustProxyHops?: number;
    /** Keeps the statements the API sends, for a test that has to show a request was
     * refused without the database being asked anything. */
    recordSql?: boolean;
  } = {},
): Promise<TestApi> {
  const lines: LogLine[] = [];
  const logger: Logger = createLogger({
    // debug, so a test can read the lines the error middleware writes for a refusal.
    level: "debug",
    destination: {
      write(line: string) {
        lines.push(JSON.parse(line) as LogLine);
      },
    },
  });

  const recorded = options.recordSql ? createSqlLoggingDatabase() : null;
  const database = recorded?.database ?? createTestDatabase(options.applicationName);
  const app = createApp({
    logger,
    database,
    accessToken: {
      secret: testAccessTokenSecret,
      // Long enough that no test expires a token by accident; the file that tests
      // expiry asks for a second of it instead.
      lifetimeSeconds: 900,
      ...options.accessToken,
    },
    authRateLimit: {
      // High enough that no test trips the limit by accident; the file that tests the
      // limit asks for a low one.
      maxAttempts: 1_000,
      windowSeconds: 900,
      ...options.authRateLimit,
    },
    refreshToken: { lifetimeSeconds: 900, ...options.refreshToken },
    // The suite speaks http, and a Secure cookie would never come back over it; the
    // test that asserts the attribute is set asks for it explicitly.
    refreshCookie: { secure: false, ...options.refreshCookie },
    ...(options.trustProxyHops === undefined ? {} : { trustProxyHops: options.trustProxyHops }),
    ...(options.frontendDir === undefined ? {} : { frontendDir: options.frontendDir }),
  });
  const server: RunningServer = await startServer({ app, port: 0, logger, shutdownTimeoutMs: 2_000 });

  return {
    database,
    request: (path, init) => fetch(new URL(path, server.url), init),
    logLines: () => [...lines],
    statements: () => [...(recorded?.statements ?? [])],
    forgetLogs: () => {
      lines.length = 0;
    },
    truncate: () => truncateAll(database),
    stop: async () => {
      await server.stop();
      await database.$disconnect();
    },
  };
}
