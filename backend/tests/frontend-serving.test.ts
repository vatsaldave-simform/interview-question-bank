import { apiErrorSchema, readinessResponseSchema } from "@iqb/shared";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";
import { logIn, seededViewer } from "./helpers/auth.js";

const frontendDir = fileURLToPath(new URL("./fixtures/frontend", import.meta.url));

/**
 * The client and the API share one origin (ADR-0012), so one Express application
 * answers both. These tests pin the boundary between them: what the fallback may
 * swallow, and what it must never swallow.
 */
describe("serving the client alongside the API", () => {
  let api: TestApi;
  let token: string;

  beforeAll(async () => {
    api = await startTestApi({ frontendDir });
    await api.truncate();
    await seedViewerAccounts(api.database);
    // An authenticated caller, because /api is behind the authentication gate: these
    // tests are about what the client fallback may swallow, not about the gate.
    token = await logIn(api, seededViewer("reader"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("serves the client at the root", async () => {
    const response = await api.request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root"></div>');
  });

  it("serves a built asset as itself", async () => {
    const response = await api.request("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(await response.text()).toContain("export const built");
  });

  it("answers a client-side route with the client, so a deep link can be shared", async () => {
    // Story 44: filter and search state lives in the URL, so the server sees paths it
    // has no route for and must hand them to the client rather than refuse them.
    const response = await api.request("/questions?category=react");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root"></div>');
  });

  it("refuses an unknown API path with the error contract, never the client", async () => {
    // The fallback sitting in front of the error middleware would turn every mistyped
    // API path into a 200 carrying HTML. This is the test that says it does not.
    const response = await api.request("/api/no-such-route", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("refuses an unknown API path the same way whatever the caller will accept", async () => {
    // A browser asks for HTML first. That must not be enough to get the client back
    // from a path that belongs to the API.
    const response = await api.request("/api/no-such-route", {
      headers: { accept: "text/html,application/xhtml+xml", authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("refuses an anonymous API path with the error contract too", async () => {
    // Unauthenticated, the same path is 401 rather than 404 — the gate sits in front
    // of the not-found handler. What matters here is that it is still the API
    // answering in JSON, and never the client in HTML.
    const response = await api.request("/api/no-such-route", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("unauthenticated");
  });

  it("refuses a write to an unknown path rather than answering it with the client", async () => {
    const response = await api.request("/questions", { method: "POST" });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("refuses a missing asset rather than answering it with the client", async () => {
    // Returning index.html for a missing bundle turns a deploy mistake into a parse
    // error in the browser, which is a much harder thing to read.
    const response = await api.request("/assets/missing.js");

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("keeps liveness and readiness at the root, in front of the fallback", async () => {
    // ADR-0012: these are the contract with the platform, not application routes, and
    // Render's health check asks for /health at the root.
    expect((await api.request("/health")).status).toBe(200);

    const ready = await api.request("/ready");
    expect(readinessResponseSchema.parse(await ready.json()).status).toBe("ready");
  });
});

describe("serving no client", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("answers an unknown path with the error contract when no client is configured", async () => {
    // How the suite and `pnpm dev` run: the API alone, with Vite serving the client.
    const response = await api.request("/questions");

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });
});
