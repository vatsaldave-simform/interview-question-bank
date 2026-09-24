import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apiPort, composeProject, databasePort } from "./stack.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function compose(...args: string[]): void {
  const run = spawnSync("docker", ["compose", "-p", composeProject, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    // These win over the same names in `.env`, which point at the development stack.
    env: { ...process.env, PORT: apiPort, DB_PORT: databasePort },
  });
  if (run.status !== 0) {
    throw new Error(`docker compose ${args.join(" ")} failed with status ${run.status}`);
  }
}

function takeTheStackDown(): void {
  // `-v` too, so the next run starts from the seed rather than from this run's Questions.
  compose("down", "-v");
}

/** Brings up the API, and through it the database, the migrations and the seed. */
export default function bringTheStackUp(): () => void {
  try {
    compose("up", "--build", "--wait", "api");
  } catch (reason) {
    takeTheStackDown();
    throw reason;
  }
  return takeTheStackDown;
}
