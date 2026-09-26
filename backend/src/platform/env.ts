import { existsSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** How long a shutdown waits for in-flight requests before closing sockets anyway. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /**
   * Connections this process may hold. The deployed database allows far more and has no
   * pooler in front of it, so this leaves room to spare; ADR-0012 has the numbers.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /**
   * Signs access tokens. Required and unguessable: anything that knows it can mint a
   * token for any Viewer. A short one is refused here rather than at the first forged
   * request nobody notices.
   */
  ACCESS_TOKEN_SECRET: z.string().min(32),
  /**
   * How long an access token lasts. Short, so a leaked one stops working quickly
   * (ADR-0008), and configurable so that the suite can set it to a second and watch a
   * token expire without a clock abstraction.
   */
  ACCESS_TOKEN_LIFETIME_SECONDS: z.coerce.number().int().positive().default(900),
  /**
   * How long a refresh token lasts, and so how long a session survives being away.
   * Longer than an access token by design (ADR-0008), and configurable so the suite can
   * watch one expire.
   */
  REFRESH_TOKEN_LIFETIME_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  /**
   * Whether the refresh cookie is marked Secure. True everywhere it is served over
   * HTTPS, which is everywhere but a laptop: a Secure cookie is not sent over http, so
   * local development would never see it come back.
   */
  REFRESH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Failed attempts on the unauthenticated endpoints one caller may make in a window. */
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(20),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  /** Proxies in front of the API; it has to match the real depth (ADR-0021). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  /**
   * Where the built client lives. Unset, the API serves no client: how the suite runs,
   * and how `pnpm dev` runs with Vite serving it instead. The deployed image sets it,
   * because there one origin serves both (ADR-0012).
   */
  FRONTEND_DIR: z.string().min(1).optional(),
  /** Required, so a deploy with no mail set up fails at startup rather than at the first
   * Viewer created. */
  MAIL_URL: z.url({ protocol: /^smtps?$/ }),
  /** Brevo refuses to send from an address it has not verified. */
  MAIL_FROM: z.string().min(1),
  /** True everywhere but a laptop, where Mailpit has no TLS to upgrade to (ADR-0037). */
  MAIL_REQUIRE_TLS: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Not the API's own address in development, where Vite serves the client on another
   * port. */
  APP_URL: z.url({ protocol: /^https?$/ }),
  /** Three days by default, to survive a weekend, and configurable so the suite can watch
   * a link expire. */
  SET_PASSWORD_LINK_LIFETIME_SECONDS: z.coerce.number().int().positive().default(259_200),
  /** An hour by default: whoever asked is at the screen now, and the mail sits in an inbox
   * after they are done. */
  PASSWORD_RESET_LINK_LIFETIME_SECONDS: z.coerce.number().int().positive().default(3_600),
  /** Five minutes by default: long enough to stop one inbox being flooded, short enough
   * that a Viewer whose mail was lost can soon ask again (ADR-0040). */
  PASSWORD_RESET_MAIL_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof envSchema>;

/** Reads a dotenv file if it is there. Real environment variables win over the file. */
export function loadEnvFile(path: string): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * Fails the process at startup rather than at the first request that needs a
 * missing variable.
 */
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment is not usable:\n${problems}`);
  }
  return parsed.data;
}
