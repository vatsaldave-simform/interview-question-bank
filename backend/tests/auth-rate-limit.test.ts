import { apiErrorSchema } from "@iqb/shared";
import { afterAll, describe, expect, it } from "vitest";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import { logIn, postLogin, seededViewer } from "./helpers/auth.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const maxAttempts = 3;
const started: TestApi[] = [];

/**
 * Its own API per test, with a window too long to reopen mid-test, so one test's spent
 * allowance is never what makes the next one pass.
 */
async function limitedApi(options: { trustProxyHops?: number } = {}): Promise<TestApi> {
  const api = await startTestApi({
    authRateLimit: { maxAttempts, windowSeconds: 900 },
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

describe("how hard a caller may knock on the authentication endpoints", () => {
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

describe("what the limit leaves alone", () => {
  it("does not spend the allowance on a refusal from another endpoint", async () => {
    // The limit is on the login route, not on the /api/auth prefix: a path behind the
    // sign-in check is refused through here on its way past, and a caller hammering one
    // must not be able to lock an address out of logging in.
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

describe("the endpoints the limit covers", () => {
  const refresh = (api: TestApi): Promise<Response> =>
    api.request("/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "iqb_refresh=not a token anyone issued" },
    });

  // Refreshing is unauthenticated too, so a caller may guess at it as freely as they
  // may guess at a password unless it is limited alongside login (ADR-0021).
  it("refuses a burst of failed refreshes with the error contract's body", async () => {
    const api = await limitedApi();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      expect((await refresh(api)).status).toBe(401);
    }

    const response = await refresh(api);

    expect(response.status).toBe(429);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("rate_limited");
  });

  // Each route counts its own, so a caller who has spent the login allowance can still
  // recover the session they already hold.
  it("keeps one endpoint's spent allowance out of another's", async () => {
    const api = await limitedApi();
    await spendTheAllowance(api);

    expect((await refresh(api)).status).toBe(401);
  });
});

describe("the set-password endpoint", () => {
  const followDeadLink = (api: TestApi): Promise<Response> =>
    api.request("/api/auth/set-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "not a token anyone issued", password: "a long enough password" }),
    });

  // Unauthenticated like login, so without a limit a caller could guess at tokens, or
  // spend the hasher, as fast as the API would answer (ADR-0021).
  it("refuses a burst of dead links with the error contract's body", async () => {
    const api = await limitedApi();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      expect((await followDeadLink(api)).status).toBe(401);
    }

    const response = await followDeadLink(api);

    expect(response.status).toBe(429);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("rate_limited");
  });

  it("keeps its allowance apart from login's", async () => {
    const api = await limitedApi();
    await spendTheAllowance(api);

    expect((await followDeadLink(api)).status).toBe(401);
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

describe("the password reset request", () => {
  const askForReset = (api: TestApi): Promise<Response> =>
    api.request("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: seededViewer("author").email }),
    });

  // It answers 202 to everything, so a limit that counted only failures could never be
  // reached, and a caller could have a Viewer mailed without end.
  it("refuses a burst of requests for a real address with the error contract's body", async () => {
    const api = await limitedApi();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      expect((await askForReset(api)).status).toBe(202);
    }

    const response = await askForReset(api);

    expect(response.status).toBe(429);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("rate_limited");
  });

  it("keeps its allowance apart from login's", async () => {
    const api = await limitedApi();
    await spendTheAllowance(api);

    expect((await askForReset(api)).status).toBe(202);
  });

  it("does not spend login's allowance", async () => {
    const api = await limitedApi();
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) await askForReset(api);

    expect((await guess(api)).status).toBe(401);
  });
});
