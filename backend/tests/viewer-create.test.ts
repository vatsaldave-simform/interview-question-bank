import { apiErrorSchema, viewerResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, postLogin, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { tokenInLink } from "./helpers/set-password-link.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function postViewer(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/viewers", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function viewerCreatedEvents(api: TestApi) {
  return api.database.changeEvent.findMany({ where: { type: "viewer_created" } });
}

const newColleague = { email: "new.colleague@iqb.test", role: "author" } as const;

describe("creating a Viewer", () => {
  let api: TestApi;
  let administratorToken: string;
  let authorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    api.forgetMail();
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    authorToken = await logIn(api, seededViewer("author"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("creates a Viewer holding the role they were given", async () => {
    const response = await postViewer(api, newColleague, administratorToken);

    expect(response.status).toBe(201);
    const { viewer } = viewerResponseSchema.parse(await response.json());
    expect(viewer).toEqual({
      id: expect.any(String),
      email: "new.colleague@iqb.test",
      role: "author",
      isAdministrator: false,
      isDeactivated: false,
    });
    const stored = await api.database.viewer.findUniqueOrThrow({ where: { id: viewer.id } });
    expect(stored.role).toBe("author");
    expect(stored.isAdministrator).toBe(false);
  });

  it("records the creation under the acting Administrator's name", async () => {
    const response = await postViewer(api, newColleague, administratorToken);
    const { viewer } = viewerResponseSchema.parse(await response.json());

    const events = await viewerCreatedEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]?.questionId).toBeNull();
    expect(events[0]?.viewerId).toBe((await viewerByRole(api.database, "reviewer")).id);
    expect(events[0]?.payload).toEqual({
      viewer: { id: viewer.id, email: "new.colleague@iqb.test" },
      role: "author",
    });
  });

  it("stores the address lower-cased, the way login looks it up", async () => {
    const response = await postViewer(
      api,
      { email: "  New.Colleague@IQB.test ", role: "reader" },
      administratorToken,
    );

    const { viewer } = viewerResponseSchema.parse(await response.json());
    expect(viewer.email).toBe("new.colleague@iqb.test");
  });

  it("mails the new Viewer a link to set their own password", async () => {
    await postViewer(api, newColleague, administratorToken);

    const mail = api.sentMail();
    expect(mail).toHaveLength(1);
    expect(mail[0]?.to).toBe("new.colleague@iqb.test");
    expect(tokenInLink(mail[0]!)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("says in the mail when the link stops working", async () => {
    const before = Date.now();
    await postViewer(api, newColleague, administratorToken);

    // The suite's links last three days, as the environment's default does.
    const expiry = /stops working at (.+ GMT)\./.exec(api.sentMail()[0]?.text ?? "")?.[1];
    expect(expiry).toBeDefined();
    const expiresAt = Date.parse(expiry!);
    expect(expiresAt).toBeGreaterThanOrEqual(Math.floor(before / 1_000) * 1_000 + 259_200_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 259_200_000);
  });

  it("creates nothing and says so when the mail cannot be sent, so the Administrator can try again", async () => {
    api.failNextMail();

    const failed = await postViewer(api, newColleague, administratorToken);

    expect(failed.status).toBe(500);
    expect(apiErrorSchema.parse(await failed.json()).error.code).toBe("internal_error");
    expect(await api.database.viewer.count({ where: { email: newColleague.email } })).toBe(0);
    expect(await viewerCreatedEvents(api)).toHaveLength(0);
    expect(api.sentMail()).toHaveLength(0);

    const retried = await postViewer(api, newColleague, administratorToken);

    expect(retried.status).toBe(201);
    expect(api.sentMail()).toHaveLength(1);
  });

  it("leaves the created Viewer unable to log in until they set a password", async () => {
    await postViewer(api, newColleague, administratorToken);

    const response = await postLogin(api, { email: newColleague.email, password: "any guess" });

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("unauthenticated");
  });

  it("refuses a Viewer who is not an Administrator, and creates nothing", async () => {
    const response = await postViewer(api, newColleague, authorToken);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    expect(await api.database.viewer.count({ where: { email: newColleague.email } })).toBe(0);
    expect(await viewerCreatedEvents(api)).toHaveLength(0);
    expect(api.sentMail()).toHaveLength(0);
  });

  it("refuses an address that already belongs to a Viewer, whatever its case, and changes nothing", async () => {
    const existing = seededViewer("reader");

    const response = await postViewer(
      api,
      { email: existing.email.toUpperCase(), role: "reviewer" },
      administratorToken,
    );

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
    expect((await viewerByRole(api.database, "reader")).email).toBe(existing.email);
    expect(await viewerCreatedEvents(api)).toHaveLength(0);
    expect(api.sentMail()).toHaveLength(0);
  });

  it.each([
    ["no email", { role: "author" }],
    ["an address that is not one", { email: "not an address", role: "author" }],
    ["no role", { email: newColleague.email }],
    ["a role that does not exist", { email: newColleague.email, role: "administrator" }],
    ["the Administrator authority", { ...newColleague, isAdministrator: true }],
    ["a password", { ...newColleague, password: "chosen by someone else" }],
  ])("refuses %s", async (_, body) => {
    const response = await postViewer(api, body, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    expect(await viewerCreatedEvents(api)).toHaveLength(0);
    expect(api.sentMail()).toHaveLength(0);
  });
});
