import { apiErrorSchema, currentViewerResponseSchema, loginResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readEnv } from "../src/platform/env.ts";
import { seedViewerAccounts, seedViewers } from "../src/features/viewers/viewers.seed.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";
import { logIn, postLogin, seededViewer, testAccessTokenSecret } from "./helpers/auth.ts";
import { readUntil } from "./helpers/wait.ts";

describe("logging in", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await api.truncate();
    await seedViewerAccounts(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it.each(seedViewers.map((viewer) => [viewer.role, viewer] as const))(
    "hands the seeded %s an access token",
    async (_role, viewer) => {
      const response = await postLogin(api, { email: viewer.email, password: viewer.password });

      expect(response.status).toBe(200);
      const body = loginResponseSchema.parse(await response.json());
      expect(body.viewer).toEqual({
        id: expect.any(String),
        email: viewer.email,
        role: viewer.role,
        isAdministrator: viewer.isAdministrator ?? false,
      });
      expect(body.expiresInSeconds).toBeGreaterThan(0);
    },
  );

  it("matches the address however it was typed", async () => {
    const viewer = seededViewer("author");

    const response = await postLogin(api, { email: `  ${viewer.email.toUpperCase()} `, password: viewer.password });

    expect(response.status).toBe(200);
  });

  it("stores the seeded credential hashed, never in the clear", async () => {
    const viewer = seededViewer("author");

    const stored = await api.database.viewer.findUniqueOrThrow({
      where: { email: viewer.email },
      select: { passwordHash: true },
    });

    expect(stored.passwordHash).not.toContain(viewer.password);
    expect(stored.passwordHash?.startsWith("$argon2id$")).toBe(true);
  });

  it("never returns anything derived from the stored credential", async () => {
    const viewer = seededViewer("reader");

    const body = await (
      await postLogin(api, { email: viewer.email, password: viewer.password })
    ).text();

    expect(body).not.toContain("argon2");
    expect(body).not.toContain(viewer.password);
  });

  it("answers a wrong password and an unknown address identically", async () => {
    const viewer = seededViewer("author");

    const wrongPassword = await postLogin(api, { email: viewer.email, password: "not the password" });
    const unknownAddress = await postLogin(api, { email: "nobody@iqb.test", password: viewer.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAddress.status).toBe(401);
    expect(await wrongPassword.text()).toBe(await unknownAddress.text());
  });

  it("refuses a Viewer whose stored credential cannot be read", async () => {
    // A hash written by something else is not a reason to let anyone in, and not a
    // reason to fail with a 500 either.
    await api.database.viewer.create({
      data: { email: "corrupt@iqb.test", role: "reader", passwordHash: "not a hash" },
    });

    const response = await postLogin(api, { email: "corrupt@iqb.test", password: "anything at all" });

    expect(response.status).toBe(401);
  });

  it("refuses a Viewer who has no password yet, the same way as a wrong password", async () => {
    await api.database.viewer.create({ data: { email: "not-yet-set@iqb.test", role: "reader" } });
    const viewer = seededViewer("author");

    const noPassword = await postLogin(api, { email: "not-yet-set@iqb.test", password: "any guess" });
    const wrongPassword = await postLogin(api, { email: viewer.email, password: "not the password" });

    expect(noPassword.status).toBe(401);
    expect(await noPassword.text()).toBe(await wrongPassword.text());
  });

  it("refuses a malformed body at the edge", async () => {
    const response = await postLogin(api, { email: "not an address", password: "" });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});

describe("the end of the anonymous path", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await api.truncate();
    await seedViewerAccounts(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("refuses a protected route with no token", async () => {
    const response = await api.request("/api/auth/me");

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json())).toEqual({
      error: { code: "unauthenticated", message: "Authentication is required." },
    });
  });

  it("answers the protected route once a token is presented", async () => {
    const viewer = seededViewer("reviewer");
    const token = await logIn(api, viewer);

    const response = await api.request("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(currentViewerResponseSchema.parse(await response.json()).viewer).toEqual({
      id: expect.any(String),
      email: viewer.email,
      role: viewer.role,
      isAdministrator: viewer.isAdministrator ?? false,
    });
  });

  it.each([
    ["no authorization header at all", undefined],
    ["an empty header", ""],
    ["a scheme the API does not speak", "Basic Zm9vOmJhcg=="],
    ["Bearer with nothing after it", "Bearer "],
    ["a token that is not a token", "Bearer not-a-token"],
    ["a token with a forged payload", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln"],
  ])("refuses %s", async (_case, authorization) => {
    const response = await api.request("/api/auth/me", {
      headers: authorization === undefined ? {} : { authorization },
    });

    expect(response.status).toBe(401);
  });

  it("refuses a token signed with a different secret", async () => {
    const viewer = seededViewer("author");
    const otherApi = await startTestApi({ accessToken: { secret: `${testAccessTokenSecret}-other` } });

    try {
      const token = await logIn(otherApi, viewer);
      const response = await api.request("/api/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(401);
    } finally {
      await otherApi.stop();
    }
  });

  it("reads the Viewer on every request rather than trusting the token", async () => {
    // The lookup is what makes a change to a Viewer take effect on their next
    // request. Removing the row is the bluntest way to observe that it happens;
    // nothing in the API does that (ADR-0017), the suite does it directly.
    const viewer = seededViewer("reader");
    const token = await logIn(api, viewer);
    // Their refresh token goes first: nothing cascades from a Viewer (ADR-0017), so
    // the row logging in just created would otherwise hold the delete back.
    await api.database.refreshToken.deleteMany({ where: { viewer: { email: viewer.email } } });
    await api.database.viewer.delete({ where: { email: viewer.email } });

    try {
      const response = await api.request("/api/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(401);
    } finally {
      await seedViewerAccounts(api.database);
    }
  });

  it("refuses an unknown /api path before deciding it is unknown", async () => {
    // No route may be reached without signing in, including one that does not exist:
    // the check sits in front of the whole /api router rather than on each endpoint.
    const response = await api.request("/api/no-such-endpoint");

    expect(response.status).toBe(401);
  });

  it("says why it refused in the log and not in the response", async () => {
    api.forgetLogs();

    const response = await api.request("/api/auth/me", {
      headers: { authorization: "Bearer not-a-token" },
    });

    expect(await response.text()).not.toContain("malformed");
    const refusal = await readUntil(
      () => api.logLines().find((line) => line["msg"] === "authentication refused"),
      (line) => line !== undefined,
    );
    expect(refusal?.["reason"]).toBe("malformed");
  });

  it("still answers the platform's health checks anonymously", async () => {
    expect((await api.request("/health")).status).toBe(200);
    expect((await api.request("/ready")).status).toBe(200);
  });
});

describe("a short-lived access token", () => {
  let api: TestApi;

  beforeAll(async () => {
    // Lifetime comes from the environment, so expiry is tested by configuring a short
    // one and waiting, rather than by hiding a clock behind an interface. Two seconds and
    // not one: a JWT's expiry is a whole second, so a token signed late in a second is
    // good for barely any of the first one.
    api = await startTestApi({ accessToken: { lifetimeSeconds: 2 } });
    await api.truncate();
    await seedViewerAccounts(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("reports the configured lifetime", async () => {
    const viewer = seededViewer("author");

    const response = await postLogin(api, { email: viewer.email, password: viewer.password });

    expect(loginResponseSchema.parse(await response.json()).expiresInSeconds).toBe(2);
  });

  it("refuses the token once it has expired", async () => {
    const viewer = seededViewer("author");
    const token = await logIn(api, viewer);

    expect((await api.request("/api/auth/me", { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const response = await api.request("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("unauthenticated");
  });
});

describe("the token settings the environment supplies", () => {
  // The application is handed its token configuration, and this is where that
  // configuration comes from in production. Read directly, because a schema that
  // silently defaulted the signing secret is not something an HTTP test would notice.
  const environment = {
    DATABASE_URL: "postgresql://iqb:iqb@localhost:5432/iqb",
    ACCESS_TOKEN_SECRET: "a-secret-long-enough-to-be-worth-having",
    MAIL_URL: "smtp://localhost:1025",
    MAIL_FROM: "bank@iqb.test",
    APP_URL: "http://localhost:5173",
  };

  it("refuses to start with no secret to sign with", () => {
    expect(() => readEnv({ DATABASE_URL: environment.DATABASE_URL })).toThrow(/ACCESS_TOKEN_SECRET/);
  });

  it("refuses to start on a secret short enough to guess", () => {
    expect(() => readEnv({ ...environment, ACCESS_TOKEN_SECRET: "short" })).toThrow(
      /ACCESS_TOKEN_SECRET/,
    );
  });

  it("takes the token lifetime from the environment", () => {
    expect(readEnv({ ...environment, ACCESS_TOKEN_LIFETIME_SECONDS: "1" })).toMatchObject({
      ACCESS_TOKEN_LIFETIME_SECONDS: 1,
    });
  });

  it("falls back to a short lifetime when the environment names none", () => {
    expect(readEnv(environment).ACCESS_TOKEN_LIFETIME_SECONDS).toBe(900);
  });
});
