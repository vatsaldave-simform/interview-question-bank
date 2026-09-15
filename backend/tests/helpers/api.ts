import type { Logger } from "pino";
import { createApp } from "../../src/app.js";
import type { Database } from "../../src/db/prisma.js";
import { createLogger } from "../../src/logging/logger.js";
import { startServer, type RunningServer } from "../../src/server.js";
import { createTestDatabase, truncateAll } from "./database.js";

export type LogLine = Record<string, unknown> & { requestId?: string; msg?: string };

export type TestApi = {
  /** Issues a real HTTP request against the running API. */
  request: (path: string, init?: RequestInit) => Promise<Response>;
  database: Database;
  /** Everything the API has logged since the last `forgetLogs()`. */
  logLines: () => LogLine[];
  forgetLogs: () => void;
  truncate: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Starts the real application on an ephemeral port, backed by the test database. Tests
 * then observe it the way a caller does, over HTTP, which is the only place the
 * guarantees this project cares about can honestly be asserted.
 */
export async function startTestApi(
  options: { applicationName?: string } = {},
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

  const database = createTestDatabase(options.applicationName);
  const app = createApp({ logger, database });
  const server: RunningServer = await startServer({ app, port: 0, logger, shutdownTimeoutMs: 2_000 });

  return {
    database,
    request: (path, init) => fetch(new URL(path, server.url), init),
    logLines: () => [...lines],
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
