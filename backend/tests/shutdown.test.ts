import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import { connectionCount, createTestDatabase } from "./helpers/test-database.ts";
import { startTestApi } from "./helpers/test-api.ts";
import { readUntil } from "./helpers/wait.ts";

describe("graceful shutdown", () => {
  // A client of its own, so it survives the shutdown it is watching.
  let observer: Database;

  beforeAll(() => {
    observer = createTestDatabase();
  });
  afterAll(async () => {
    await observer.$disconnect();
  });

  it("stops serving and releases the database connections it held", async () => {
    const applicationName = `iqb-shutdown-${randomUUID()}`;
    const api = await startTestApi({ applicationName });

    expect((await api.request("/ready")).status).toBe(200);
    expect(await connectionCount(observer, applicationName)).toBeGreaterThan(0);

    await api.stop();

    await expect(api.request("/health")).rejects.toThrow();
    expect(await releasedConnections(observer, applicationName)).toBe(0);
  });

  it("shuts down once however many times it is asked", async () => {
    const api = await startTestApi();

    await Promise.all([api.stop(), api.stop(), api.stop()]);

    await expect(api.request("/health")).rejects.toThrow();
  });
});

/** Postgres notices a closed connection a moment after the pool has let go of it. */
function releasedConnections(observer: Database, applicationName: string): Promise<number> {
  return readUntil(
    () => connectionCount(observer, applicationName),
    (count) => count === 0,
  );
}
