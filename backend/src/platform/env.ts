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
   * Where the built client lives. Unset, the API serves no client: how the suite runs,
   * and how `pnpm dev` runs with Vite serving it instead. The deployed image sets it,
   * because there one origin serves both (ADR-0012).
   */
  FRONTEND_DIR: z.string().min(1).optional(),
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
