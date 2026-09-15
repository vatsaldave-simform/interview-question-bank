import { apiErrorSchema } from "@iqb/shared";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  InvalidRequestError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
} from "../src/errors/app-error.js";
import { errorHandler, notFoundHandler } from "../src/http/error-handler.js";
import { startServer, type RunningServer } from "../src/server.js";
import { createLogger } from "../src/logging/logger.js";
import { startTestApi, type TestApi } from "./helpers/api.js";

describe("the error contract on the running API", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("answers an unknown route with the not-found body", async () => {
    const response = await api.request("/no-such-route");

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("refuses a malformed body at the edge, before any handler sees it", async () => {
    const response = await api.request("/health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("carries a request id on an error response, and never in its body", async () => {
    const response = await api.request("/no-such-route");

    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(JSON.stringify(await response.json())).not.toContain(
      response.headers.get("x-request-id") ?? "",
    );
  });

  it("answers two not-found requests with byte-identical bodies", async () => {
    // The property the whole visibility design rests on: nothing that varies per
    // request may reach an error body, or two "not found" answers could be told apart.
    const first = await (await api.request("/no-such-route")).text();
    const second = await (await api.request("/another-unknown-route")).text();

    expect(first).toBe(second);
  });
});

describe("the status code for every error the API raises", () => {
  // The mapping is what this asserts, so the probe app raises each error from a route
  // and lets the real middleware answer. The routes exist to be refused; no endpoint
  // in the API sets a status code for an error itself.
  let server: RunningServer;

  const raised: Record<string, () => never> = {
    "invalid-request": () => {
      throw new InvalidRequestError("That is not valid.", { field: "text" });
    },
    unauthenticated: () => {
      throw new UnauthenticatedError();
    },
    forbidden: () => {
      throw new ForbiddenError();
    },
    "not-found": () => {
      throw new NotFoundError();
    },
    conflict: () => {
      throw new ConflictError("That already exists.");
    },
    "rate-limited": () => {
      throw new RateLimitedError();
    },
    unexpected: () => {
      throw new Error("connection to postgres://viewer:hunter2@db failed");
    },
  };

  beforeAll(async () => {
    const app = express();
    for (const [path, raise] of Object.entries(raised)) {
      app.get(`/${path}`, () => raise());
    }
    app.use(notFoundHandler);
    app.use(errorHandler);
    server = await startServer({
      app,
      port: 0,
      logger: createLogger({ level: "silent" }),
      shutdownTimeoutMs: 2_000,
    });
  });
  afterAll(async () => {
    await server.stop();
  });

  const expected = [
    ["invalid-request", 400, "invalid_request"],
    ["unauthenticated", 401, "unauthenticated"],
    ["forbidden", 403, "forbidden"],
    ["not-found", 404, "not_found"],
    ["conflict", 409, "conflict"],
    ["rate-limited", 429, "rate_limited"],
    ["unexpected", 500, "internal_error"],
  ] as const;

  it.each(expected)("answers /%s with %i and the code %s", async (path, status, code) => {
    const response = await fetch(new URL(`/${path}`, server.url));

    expect(response.status).toBe(status);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe(code);
  });

  it("tells the caller nothing about an unexpected failure", async () => {
    const response = await fetch(new URL("/unexpected", server.url));
    const body = await response.text();

    expect(JSON.parse(body)).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    expect(body).not.toContain("postgres");
    expect(body).not.toContain("hunter2");
  });

  it("passes an error's details through when the error carries them", async () => {
    const response = await fetch(new URL("/invalid-request", server.url));

    expect(apiErrorSchema.parse(await response.json()).error.details).toEqual({ field: "text" });
  });
});
