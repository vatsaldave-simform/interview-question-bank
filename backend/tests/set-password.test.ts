import { apiErrorSchema, loginResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issuePasswordToken } from "../src/features/auth/password-token.ts";
import { logIn, postLogin, seededViewer } from "./helpers/auth.ts";
import { refreshCookieHeader, refreshCookieValue } from "./helpers/cookies.ts";
import { seedTheBank } from "./helpers/question-bank.ts";
import { tokenMailedTo } from "./helpers/set-password-link.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

const newColleague = { email: "new.colleague@iqb.test", role: "author" } as const;
const chosenPassword = "a long password of my own";

function postSetPassword(api: TestApi, body: unknown): Promise<Response> {
  return api.request("/api/auth/set-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Creates the Viewer over HTTP, as an Administrator does, and opens the mail it sent. */
async function createAndOpenLink(api: TestApi): Promise<string> {
  // The seeded Reviewer is the only Administrator (viewers.seed.ts).
  const administratorToken = await logIn(api, seededViewer("reviewer"));
  const response = await api.request("/api/viewers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${administratorToken}`,
    },
    body: JSON.stringify(newColleague),
  });
  expect(response.status).toBe(201);
  return tokenMailedTo(api, newColleague.email);
}

async function expectDeadLink(response: Response): Promise<void> {
  expect(response.status).toBe(401);
  expect(apiErrorSchema.parse(await response.json())).toEqual({
    error: {
      code: "unauthenticated",
      message: "This link is not valid. It may have expired or been used already.",
    },
  });
}

describe("setting a password from the mailed link", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    api.forgetMail();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("sets the password, and the Viewer then logs in with it", async () => {
    const token = await createAndOpenLink(api);

    const response = await postSetPassword(api, { token, password: chosenPassword });

    expect(response.status).toBe(204);
    const login = await postLogin(api, { email: newColleague.email, password: chosenPassword });
    expect(login.status).toBe(200);
    const { viewer } = loginResponseSchema.parse(await login.json());
    expect(viewer).toMatchObject({ email: newColleague.email, role: "author" });
  });

  it("refuses the link the second time, and keeps the password it set the first", async () => {
    const token = await createAndOpenLink(api);
    await postSetPassword(api, { token, password: chosenPassword });

    const second = await postSetPassword(api, { token, password: "someone else's password" });

    await expectDeadLink(second);
    const withSecond = { email: newColleague.email, password: "someone else's password" };
    expect((await postLogin(api, withSecond)).status).toBe(401);
    const withFirst = { email: newColleague.email, password: chosenPassword };
    expect((await postLogin(api, withFirst)).status).toBe(200);
  });

  it("refuses a link nobody issued exactly as it refuses a used one", async () => {
    const token = await createAndOpenLink(api);
    await postSetPassword(api, { token, password: chosenPassword });

    const used = await postSetPassword(api, { token, password: chosenPassword });
    const unknown = await postSetPassword(api, {
      token: "not-a-token-anyone-issued",
      password: chosenPassword,
    });

    expect(await statusAndBody(unknown)).toBe(await statusAndBody(used));
  });

  it("refuses a short password, and leaves the link working", async () => {
    const token = await createAndOpenLink(api);

    const short = await postSetPassword(api, { token, password: "fourteen chars" });

    expect(short.status).toBe(400);
    expect(apiErrorSchema.parse(await short.json()).error.code).toBe("invalid_request");
    expect((await postSetPassword(api, { token, password: chosenPassword })).status).toBe(204);
  });

  it("ends every session a Viewer already has, and their old password stops working", async () => {
    const viewer = seededViewer("author");
    const login = await postLogin(api, { email: viewer.email, password: viewer.password });
    const { id } = await api.database.viewer.findUniqueOrThrow({
      where: { email: viewer.email },
      select: { id: true },
    });
    // Issued directly, as the reset request will issue one for a Viewer who already has a
    // password.
    const { token } = await issuePasswordToken(api.database, id, { lifetimeSeconds: 3_600 });

    expect((await postSetPassword(api, { token, password: chosenPassword })).status).toBe(204);

    const refresh = await api.request("/api/auth/refresh", {
      method: "POST",
      headers: refreshCookieHeader(refreshCookieValue(login)),
    });
    expect(refresh.status).toBe(401);
    expect((await postLogin(api, { email: viewer.email, password: viewer.password })).status).toBe(401);
    expect((await postLogin(api, { email: viewer.email, password: chosenPassword })).status).toBe(200);
  });

  it.each([
    ["no token", { password: chosenPassword }],
    ["no password", { token: "a-token" }],
    ["an empty token", { token: "", password: chosenPassword }],
    ["a password longer than 128 characters", { token: "a-token", password: "x".repeat(129) }],
    ["a field it does not know", { token: "a-token", password: chosenPassword, role: "reviewer" }],
  ])("refuses %s", async (_, body) => {
    const response = await postSetPassword(api, body);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});

describe("a link left too long", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi({ setPasswordLink: { lifetimeSeconds: 1 } });
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("is refused, and the Viewer still cannot log in", async () => {
    const token = await createAndOpenLink(api);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const response = await postSetPassword(api, { token, password: chosenPassword });

    await expectDeadLink(response);
    const login = await postLogin(api, { email: newColleague.email, password: chosenPassword });
    expect(login.status).toBe(401);
  });
});
