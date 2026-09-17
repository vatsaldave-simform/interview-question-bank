import { apiErrorSchema } from "@iqb/shared";
import { afterAll, describe, expect, it } from "vitest";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.js";
import { logIn, postLogin, seededViewer } from "./helpers/auth.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

const maxAttempts = 3;
const started: TestApi[] = [];

/**
 * Its own API per test, with a window too long to reopen mid-test, so one test's spent
 * allowance is never what makes the next one pass.
 */
async function limitedApi(options: { trustProxyHops?: number } = {}): Promise<TestApi> {
  const api = await startTestApi({
    loginRateLimit: { maxAttempts, windowSeconds: 900 },
    ...options,
  });
  started.push(api);
  await api.truncate();
  await seedViewerAccounts(api.database);
  return api;
}

afterAll(async () => {
  await Promise.all(started.map((api) => api.stop()));
});

/** A wrong password, which is what credential stuffing produces by the thousand. */
function guess(api: TestApi, headers: Record<string, string> = {}): Promise<Response> {
  return postLogin(api, { email: seededViewer("author").email, password: "no" }, headers);
}

async function spendTheAllowance(api: TestApi, headers: Record<string, string> = {}): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    expect((await guess(api, headers)).status).toBe(401);
  }
}

describe("how hard a caller may knock on the login endpoint", () => {
  it("refuses a burst of guesses with the error contract", async () => {
    const api = await limitedApi();
    await spendTheAllowance(api);

    const refused = await guess(api);

    expect(refused.status).toBe(429);
    expect(apiErrorSchema.parse(await refused.json())).toEqual({
      error: { code: "rate_limited", message: "Too many requests." },
    });
  });

  it("refuses the right password too, once the allowance is spent", async () => {
    // The limit sits in front of the handler, so a caller who has been guessing does
    // not get in by finally guessing correctly.
    const api = await limitedApi();
    const viewer = seededViewer("author");
    await spendTheAllowance(api);

    const response = await postLogin(api, { email: viewer.email, password: viewer.password });

    expect(response.status).toBe(429);
  });

  it("does not spend the allowance on signing in successfully", async () => {
    const api = await limitedApi();
    const viewer = seededViewer("reviewer");

    // More successful logins than the limit allows failures: colleagues behind one
    // office address must not lock each other out by working.
    for (let attempt = 0; attempt < maxAttempts + 2; attempt += 1) await logIn(api, viewer);

    const response = await postLogin(api, { email: viewer.email, password: viewer.password });
    expect(response.status).toBe(200);
  });
});

describe("what the login limit leaves alone", () => {
  it("does not spend the allowance on a refusal from another endpoint", async () => {
    // The limit is on the login route, not on the /api/auth prefix: a path the
    // authentication gate owns is refused through here on its way past, and a caller
    // hammering one must not be able to lock an address out of logging in.
    const api = await limitedApi();
    const viewer = seededViewer("author");

    for (let attempt = 0; attempt < maxAttempts + 2; attempt += 1) {
      expect((await api.request("/api/auth/me")).status).toBe(401);
    }

    const response = await postLogin(api, { email: viewer.email, password: viewer.password });
    expect(response.status).toBe(200);
  });

  it("still answers the platform's health checks once the allowance is spent", async () => {
    // Render decides whether to route traffic on this, so a caller guessing passwords
    // must not be able to take the service off the air.
    const api = await limitedApi();
    await spendTheAllowance(api);

    expect((await api.request("/health")).status).toBe(200);
    expect((await api.request("/ready")).status).toBe(200);
  });

  it("still serves an authenticated Viewer once the allowance is spent", async () => {
    const api = await limitedApi();
    const token = await logIn(api, seededViewer("author"));
    await spendTheAllowance(api);

    const response = await api.request("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
  });
});

describe("which caller the allowance belongs to", () => {
  const from = (address: string): Record<string, string> => ({ "x-forwarded-for": address });

  it("gives each caller their own allowance when a proxy is trusted", async () => {
    const api = await limitedApi({ trustProxyHops: 1 });
    await spendTheAllowance(api, from("203.0.113.1"));

    expect((await guess(api, from("203.0.113.1"))).status).toBe(429);
    // A second caller through the same proxy has not spent anything.
    expect((await guess(api, from("203.0.113.2"))).status).toBe(401);
  });

  it("ignores a caller's own claim about their address when no proxy is trusted", async () => {
    // Trusting the header without a proxy in front would hand every request a fresh
    // allowance for the cost of inventing an address.
    const api = await limitedApi();
    await spendTheAllowance(api, from("203.0.113.1"));

    expect((await guess(api, from("198.51.100.7"))).status).toBe(429);
  });
});
