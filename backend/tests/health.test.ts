import { healthResponseSchema, readinessResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "./helpers/api.js";
import { withDatabaseUrl } from "./helpers/env.js";

describe("health and readiness", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("reports liveness without asking the database", async () => {
    const response = await api.request("/health");

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
  });

  it("reports readiness once the database answers", async () => {
    const response = await api.request("/ready");

    expect(response.status).toBe(200);
    expect(readinessResponseSchema.parse(await response.json())).toEqual({
      status: "ready",
      checks: { database: "up" },
    });
  });

  it("reports not ready when the database cannot be reached", async () => {
    // The same application, pointed at a port nothing listens on, so the check fails
    // the way a dead database would rather than through a stubbed method.
    const brokenApi = await withDatabaseUrl(unreachableDatabaseUrl(), startTestApi);

    try {
      const response = await brokenApi.request("/ready");

      expect(response.status).toBe(503);
      expect(readinessResponseSchema.parse(await response.json())).toEqual({
        status: "not_ready",
        checks: { database: "down" },
      });
    } finally {
      await brokenApi.stop();
    }
  });

  it("still reports liveness when the database is unreachable", async () => {
    const brokenApi = await withDatabaseUrl(unreachableDatabaseUrl(), startTestApi);

    try {
      expect((await brokenApi.request("/health")).status).toBe(200);
    } finally {
      await brokenApi.stop();
    }
  });
});

function unreachableDatabaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.port = "1";
  return url.toString();
}
