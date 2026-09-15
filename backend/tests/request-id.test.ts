import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "./helpers/api.js";
import { readUntil } from "./helpers/wait.js";

describe("request id in the response and the logs", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(() => {
    api.forgetLogs();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("answers with a request id and logs every line of that request against it", async () => {
    const response = await api.request("/health");
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    const lines = await logLinesFor(api, requestId);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.requestId === requestId)).toBe(true);
    expect(lines.map((line) => line.msg)).toContain("request completed");
  });

  it("gives two requests two different ids", async () => {
    const first = await api.request("/health");
    const second = await api.request("/health");

    expect(first.headers.get("x-request-id")).not.toBe(second.headers.get("x-request-id"));
  });

  it("threads the id through a refusal logged by the error middleware", async () => {
    const response = await api.request("/no-such-route");
    const requestId = response.headers.get("x-request-id");

    const lines = await logLinesFor(api, requestId);
    expect(lines.map((line) => line.msg)).toEqual(
      expect.arrayContaining(["request refused", "request completed"]),
    );
    expect(lines.every((line) => line.requestId === requestId)).toBe(true);
  });

  it("adopts a caller's request id so a trace survives the hop", async () => {
    const response = await api.request("/health", { headers: { "x-request-id": "caller-supplied-id" } });

    expect(response.headers.get("x-request-id")).toBe("caller-supplied-id");
    const lines = await logLinesFor(api, "caller-supplied-id");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("replaces a caller's request id that is not a short, printable string", async () => {
    const oversized = "x".repeat(300);

    const response = await api.request("/health", { headers: { "x-request-id": oversized } });

    expect(response.headers.get("x-request-id")).not.toBe(oversized);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

/** The request is only finished logging once its completion line has been written. */
function logLinesFor(api: TestApi, requestId: string | null) {
  return readUntil(
    () => api.logLines().filter((line) => line.requestId === requestId),
    (lines) => lines.some((line) => line.msg === "request completed"),
  );
}
