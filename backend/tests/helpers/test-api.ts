import type { Logger } from "pino";
import { createApp } from "../../src/app.ts";
import type { AccessTokenConfig } from "../../src/features/auth/access-token.ts";
import type { PasswordTokenConfig } from "../../src/features/auth/password-token.ts";
import type { Database } from "../../src/platform/database.ts";
import type { RefreshCookieConfig } from "../../src/features/auth/refresh-cookie.ts";
import type { RefreshTokenConfig } from "../../src/features/auth/refresh-token.ts";
import type { RateLimitConfig } from "../../src/platform/http/rate-limit.middleware.ts";
import { createLogger } from "../../src/platform/logger.ts";
import type { MailMessage } from "../../src/platform/mail.ts";
import { startServer, type RunningServer } from "../../src/platform/server.ts";
import { testAccessTokenSecret } from "./auth.ts";
import { createRecordingMailer } from "./recording-mailer.ts";
import { testAppUrl } from "./set-password-link.ts";
import { createSqlLoggingDatabase, createTestDatabase, truncateAll } from "./test-database.ts";

export type LogLine = Record<string, unknown> & { requestId?: string; msg?: string };

/** Everything a caller gets to look at, in one string a test can compare. Two responses
 * that have to be indistinguishable are held to each other through this. */
export async function statusAndBody(response: Response): Promise<string> {
  return `${response.status} ${await response.text()}`;
}

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
  /** Every mail the API has sent since the last `forgetMail()`, oldest first, none of which
   * left the process. */
  sentMail: () => MailMessage[];
  forgetMail: () => void;
  /** The API's next send fails, as it would with the mail server down. */
  failNextMail: () => void;
  /** The API's next send waits until the function handed back is called. */
  holdNextMail: () => () => void;
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
    /** Overrides for the set-password link's lifetime, for a test that expires one. */
    setPasswordLink?: Partial<PasswordTokenConfig>;
    /** Overrides for the reset link's lifetime, for a test that expires one. */
    passwordResetLink?: Partial<PasswordTokenConfig>;
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
  const mailer = createRecordingMailer();
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
    mailer,
    // Three days, as the environment's default is; the file that expires a link asks for
    // a second of it instead.
    setPasswordLink: { appUrl: testAppUrl, lifetimeSeconds: 259_200, ...options.setPasswordLink },
    // An hour, as the environment's default is.
    passwordResetLink: { appUrl: testAppUrl, lifetimeSeconds: 3_600, ...options.passwordResetLink },
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
    sentMail: mailer.sent,
    forgetMail: mailer.forget,
    failNextMail: mailer.failNextSend,
    holdNextMail: mailer.holdNextSend,
    truncate: () => truncateAll(database),
    stop: async () => {
      await server.stop();
      await database.$disconnect();
    },
  };
}
