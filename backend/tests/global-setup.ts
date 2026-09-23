import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../src/platform/env.ts";
import { testDatabaseUrl } from "./helpers/test-database.ts";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Brings the test database up to the current schema once per run, so the suite works
 * from a clean checkout against an empty database with no manual step.
 */
export default function setup(): void {
  loadEnvFile(`${workspaceRoot}/.env.test`);
  process.env.NODE_ENV = "test";

  const url = testDatabaseUrl();
  execFileSync(`${backendDir}node_modules/.bin/prisma`, ["migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
