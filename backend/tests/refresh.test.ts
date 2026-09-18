import { apiErrorSchema, loginResponseSchema, refreshResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.js";
import { postLogin, seededViewer } from "./helpers/auth.js";
import {
  refreshCookieAttributes,
  refreshCookieHeader,
  refreshCookieValue,
  setsRefreshCookie,
} from "./helpers/cookies.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

/**
 * The session a Viewer keeps across a reload, and what happens to it when a token that
 * has already been spent comes back.
 */
describe("refreshing a session", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await api.truncate();
    await seedViewerAccounts(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  beforeEach(async () => {
    await api.database.refreshToken.deleteMany();
  });

  /** Signs in and hands back the refresh token the browser would have been given. */
  async function logInForCookie(): Promise<string> {
    const response = await postLogin(api, {
      email: seededViewer("author").email,
      password: seededViewer("author").password,
    });
    expect(response.status).toBe(200);
    return refreshCookieValue(response);
  }

  function refresh(token: string): Promise<Response> {
    return api.request("/api/auth/refresh", {
      method: "POST",
      headers: refreshCookieHeader(token),
    });
  }

  it("delivers the refresh token as an httpOnly, Secure, SameSite cookie", async () => {
    const api2 = await startTestApi({ refreshCookie: { secure: true } });
    try {
      const response = await postLogin(api2, {
        email: seededViewer("reader").email,
        password: seededViewer("reader").password,
      });

      const attributes = refreshCookieAttributes(response);
      expect(attributes).toContain("httponly");
      expect(attributes).toContain("secure");
      expect(attributes).toContain("samesite=strict");
      expect(attributes).toContain("path=/api/auth");
    } finally {
      await api2.stop();
    }
  });

  it("never puts the access token in a cookie", async () => {
    const response = await postLogin(api, {
      email: seededViewer("author").email,
      password: seededViewer("author").password,
    });

    const body = loginResponseSchema.parse(await response.json());
    const cookies = response.headers.getSetCookie().join(" ");
    expect(cookies).not.toContain(body.accessToken);
  });

  it("issues a new access token and rotates the refresh token", async () => {
    const first = await logInForCookie();

    const response = await refresh(first);

    expect(response.status).toBe(200);
    const body = refreshResponseSchema.parse(await response.json());
    expect(body.viewer.email).toBe(seededViewer("author").email);
    expect(refreshCookieValue(response)).not.toBe(first);
  });

  it("stops the old token working once it has been rotated", async () => {
    const first = await logInForCookie();
    await refresh(first);

    const again = await refresh(first);

    expect(again.status).toBe(401);
    expect(apiErrorSchema.parse(await again.json()).error.code).toBe("unauthenticated");
  });

  // The ticket's reason for existing: the sibling is the token the Viewer's own browser
  // is holding, and it has to die with the family.
  it("revokes the whole family when a spent token is presented, sibling included", async () => {
    const first = await logInForCookie();
    const sibling = refreshCookieValue(await refresh(first));

    await refresh(first);

    const response = await refresh(sibling);
    expect(response.status).toBe(401);
  });

  it("refuses to refresh after a logout", async () => {
    const token = await logInForCookie();

    const loggedOut = await api.request("/api/auth/logout", {
      method: "POST",
      headers: refreshCookieHeader(token),
    });
    expect(loggedOut.status).toBe(204);

    expect((await refresh(token)).status).toBe(401);
  });

  it("clears the cookie on the way out, so the client stops presenting a dead token", async () => {
    const token = await logInForCookie();

    const response = await api.request("/api/auth/logout", {
      method: "POST",
      headers: refreshCookieHeader(token),
    });

    expect(refreshCookieAttributes(response)).toContain("path=/api/auth");
    expect(refreshCookieValue(response)).toBe("");
  });

  it("answers a logout with no cookie the same as one with a token nobody holds", async () => {
    const withNothing = await api.request("/api/auth/logout", { method: "POST" });
    const withRubbish = await api.request("/api/auth/logout", {
      method: "POST",
      headers: refreshCookieHeader("not a token anyone issued"),
    });

    expect(withNothing.status).toBe(204);
    expect(withRubbish.status).toBe(204);
  });

  it("refuses a refresh with no cookie at all", async () => {
    const response = await api.request("/api/auth/refresh", { method: "POST" });

    expect(response.status).toBe(401);
    expect(setsRefreshCookie(response)).toBe(false);
  });

  it("clears the cookie when the token it holds is refused", async () => {
    const response = await refresh("not a token anyone issued");

    expect(response.status).toBe(401);
    expect(refreshCookieValue(response)).toBe("");
  });

  it("refuses an expired refresh token", async () => {
    const api2 = await startTestApi({ refreshToken: { lifetimeSeconds: 1 } });
    try {
      const response = await postLogin(api2, {
        email: seededViewer("reviewer").email,
        password: seededViewer("reviewer").password,
      });
      const token = refreshCookieValue(response);
      await api2.database.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const refreshed = await api2.request("/api/auth/refresh", {
        method: "POST",
        headers: refreshCookieHeader(token),
      });

      expect(refreshed.status).toBe(401);
    } finally {
      await api2.stop();
    }
  });

  // A caller who is told which kind of refusal they earned learns whether the token
  // they hold was ever real, and whether presenting it ended someone's session.
  it("says the same thing however a refresh was refused", async () => {
    const first = await logInForCookie();
    const sibling = refreshCookieValue(await refresh(first));
    const reused = await refresh(first);
    const revoked = await refresh(sibling);
    const unknown = await refresh("not a token anyone issued");
    expect([reused.status, revoked.status, unknown.status]).toEqual([401, 401, 401]);

    const bodies = await Promise.all([reused.text(), revoked.text(), unknown.text()]);
    expect(new Set(bodies).size).toBe(1);
  });
});
