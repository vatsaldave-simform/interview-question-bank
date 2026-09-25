import { apiErrorSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, postLogin, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { tokenMailedTo } from "./helpers/set-password-link.ts";
import { startTestApi, statusAndBody, type LogLine, type TestApi } from "./helpers/test-api.ts";
import { readUntil } from "./helpers/wait.ts";

const nobody = "nobody.here@iqb.test";
const newColleague = "new.colleague@iqb.test";

/** As an Administrator does it, so the Viewer has no password yet. The mail that sends is
 * forgotten, so a test reads only what a reset sends, and its token is handed back. */
async function createViewerWithNoPassword(api: TestApi): Promise<string> {
  // The seeded Reviewer is the only Administrator (viewers.seed.ts).
  const administratorToken = await logIn(api, seededViewer("reviewer"));
  const response = await api.request("/api/viewers", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${administratorToken}` },
    body: JSON.stringify({ email: newColleague, role: "reader" }),
  });
  expect(response.status).toBe(201);
  const token = tokenMailedTo(api, newColleague);
  api.forgetMail();
  return token;
}

/** Deactivates the seeded Reader, whose address is then the Deactivated one. */
async function deactivateTheReader(api: TestApi): Promise<string> {
  const administratorToken = await logIn(api, seededViewer("reviewer"));
  const reader = await viewerByRole(api.database, "reader");
  const response = await api.request(`/api/viewers/${reader.id}/deactivation`, {
    method: "POST",
    headers: { authorization: `Bearer ${administratorToken}` },
  });
  expect(response.status).toBe(200);
  return reader.email;
}

const newPassword = "a long password of my own";

function postSetPassword(api: TestApi, token: string): Promise<Response> {
  return api.request("/api/auth/set-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: newPassword }),
  });
}

function postPasswordReset(api: TestApi, body: unknown): Promise<Response> {
  return api.request("/api/auth/password-reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function handledSoFar(lines: LogLine[]): number {
  return lines.filter((line) => line.msg === "password reset request handled").length;
}

/** The work goes on after the response, so a test waits on the line that says it is done
 * before it looks at what was mailed. */
async function waitUntilHandled(api: TestApi, count: number): Promise<void> {
  const lines = await readUntil(api.logLines, (current) => handledSoFar(current) >= count);
  if (handledSoFar(lines) < count) {
    throw new Error(`Only ${handledSoFar(lines)} of ${count} were handled.`);
  }
}

function heldBack(lines: LogLine[]): LogLine[] {
  return lines.filter((line) => line.msg === "password reset mail held back");
}

/** How many requests are queued behind another's lock on a Viewer, so a race test knows
 * they all got there. */
function waitingForTheLock(api: TestApi): () => Promise<number> {
  return async () => {
    const [row] = await api.database.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
    return row?.waiting ?? 0;
  };
}

/** Asks for a reset and waits for the work behind it. */
async function askForReset(api: TestApi, email: string): Promise<Response> {
  const before = handledSoFar(api.logLines());
  const response = await postPasswordReset(api, { email });
  await waitUntilHandled(api, before + 1);
  return response;
}

describe("asking for a password reset", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    api.forgetMail();
    api.forgetLogs();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("answers every address exactly the same, whether or not it has an account", async () => {
    await createViewerWithNoPassword(api);
    const deactivated = await deactivateTheReader(api);

    const answers = [
      await askForReset(api, seededViewer("author").email),
      await askForReset(api, nobody),
      await askForReset(api, deactivated),
      await askForReset(api, newColleague),
    ];

    expect(answers[0]?.status).toBe(202);
    const seen = await Promise.all(answers.map(statusAndBody));
    expect(new Set(seen).size).toBe(1);
  });

  it("answers before the mail has gone", async () => {
    const releaseMail = api.holdNextMail();

    const response = await postPasswordReset(api, { email: seededViewer("author").email });

    expect(response.status).toBe(202);
    expect(api.sentMail()).toEqual([]);
    releaseMail();
    await waitUntilHandled(api, 1);
    expect(api.sentMail()).toHaveLength(1);
  });

  it("mails a link that sets a new password, and the old one stops working", async () => {
    const author = seededViewer("author");
    await askForReset(api, author.email);

    const response = await postSetPassword(api, tokenMailedTo(api, author.email));

    expect(response.status).toBe(204);
    expect((await postLogin(api, { email: author.email, password: author.password })).status).toBe(
      401,
    );
    expect((await postLogin(api, { email: author.email, password: newPassword })).status).toBe(200);
  });

  it("mails a link that works once", async () => {
    const email = seededViewer("author").email;
    await askForReset(api, email);
    const token = tokenMailedTo(api, email);
    await postSetPassword(api, token);

    expect((await postSetPassword(api, token)).status).toBe(401);
  });

  it("sends one mail for two requests inside the window, and answers both the same", async () => {
    const email = seededViewer("author").email;

    const first = await askForReset(api, email);
    const second = await askForReset(api, email);

    expect(api.sentMail().map((mail) => mail.to)).toEqual([email]);
    expect(await statusAndBody(second)).toBe(await statusAndBody(first));
  });

  it("logs a held-back mail by the Viewer's id and not their address", async () => {
    const email = seededViewer("author").email;
    await askForReset(api, email);
    await askForReset(api, email);

    const lines = heldBack(api.logLines());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ viewerId: (await viewerByRole(api.database, "author")).id });
    expect(JSON.stringify(lines[0])).not.toContain(email);
  });

  it("sends one mail for several requests at the same moment", async () => {
    const email = seededViewer("author").email;
    // The first send is kept waiting inside its transaction, so the others arrive before
    // its link is there to be seen.
    const releaseMail = api.holdNextMail();

    const answers = await Promise.all(
      Array.from({ length: 4 }, () => postPasswordReset(api, { email })),
    );
    await readUntil(waitingForTheLock(api), (waiting) => waiting === 3);
    expect(await waitingForTheLock(api)()).toBe(3);
    releaseMail();
    await waitUntilHandled(api, 4);

    expect(api.sentMail()).toHaveLength(1);
    expect(heldBack(api.logLines())).toHaveLength(3);
    expect(new Set(await Promise.all(answers.map(statusAndBody))).size).toBe(1);
  });

  it("leaves the link already mailed working when it holds a mail back", async () => {
    const email = seededViewer("author").email;
    await askForReset(api, email);
    const mailed = tokenMailedTo(api, email);
    await askForReset(api, email);

    expect((await postSetPassword(api, mailed)).status).toBe(204);
  });

  it("sends a new Viewer no second mail, and leaves their first link working", async () => {
    const firstLink = await createViewerWithNoPassword(api);

    await askForReset(api, newColleague);

    expect(api.sentMail()).toEqual([]);
    expect((await postSetPassword(api, firstLink)).status).toBe(204);
  });

  it("answers the same when the mail fails to send, logs it, and keeps working", async () => {
    const email = seededViewer("author").email;
    api.failNextMail();

    const failed = await askForReset(api, email);

    expect(await statusAndBody(failed)).toBe(await statusAndBody(await askForReset(api, nobody)));
    const failure = api.logLines().find((line) => line.msg === "password reset link not mailed");
    expect(failure).toMatchObject({ viewerId: (await viewerByRole(api.database, "author")).id });
    expect(JSON.stringify(failure)).not.toContain(email);
    await askForReset(api, email);
    expect(api.sentMail().map((mail) => mail.to)).toEqual([email]);
  });

  it.each([
    ["no address", {}],
    ["something that is not an address", { email: "not an address" }],
    ["a field it does not know", { email: nobody, password: "let me in" }],
  ])("refuses %s", async (_, body) => {
    const response = await postPasswordReset(api, body);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});

const shortWindowSeconds = 1;

const waitOutTheWindow = () =>
  new Promise((resolve) => setTimeout(resolve, shortWindowSeconds * 1_000 + 100));

describe("asking for a reset again once the window has passed", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi({ passwordResetLink: { mailWindowSeconds: shortWindowSeconds } });
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    api.forgetMail();
    api.forgetLogs();
  });
  afterAll(async () => {
    await api.stop();
  });

  it("sends a mail again", async () => {
    const email = seededViewer("author").email;
    await askForReset(api, email);
    await waitOutTheWindow();

    await askForReset(api, email);

    expect(api.sentMail().map((mail) => mail.to)).toEqual([email, email]);
  });

  it("mails an active Viewer and one with no password yet, and nobody else", async () => {
    await createViewerWithNoPassword(api);
    const deactivated = await deactivateTheReader(api);
    await waitOutTheWindow();

    await askForReset(api, nobody);
    await askForReset(api, deactivated);
    await askForReset(api, seededViewer("author").email);
    await askForReset(api, newColleague);

    expect(api.sentMail().map((mail) => mail.to)).toEqual([
      seededViewer("author").email,
      newColleague,
    ]);
  });

  it("stops the first mail's link working once a second is asked for", async () => {
    const email = seededViewer("author").email;
    await askForReset(api, email);
    const first = tokenMailedTo(api, email);
    await waitOutTheWindow();
    await askForReset(api, email);

    expect((await postSetPassword(api, first)).status).toBe(401);
    expect((await postSetPassword(api, tokenMailedTo(api, email))).status).toBe(204);
  });

  it("lets a Viewer with no password yet replace their first link", async () => {
    await createViewerWithNoPassword(api);
    await waitOutTheWindow();
    await askForReset(api, newColleague);

    expect((await postSetPassword(api, tokenMailedTo(api, newColleague))).status).toBe(204);
    expect((await postLogin(api, { email: newColleague, password: newPassword })).status).toBe(200);
  });
});

describe("a reset link left too long", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi({ passwordResetLink: { lifetimeSeconds: 1 } });
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("is refused, and the old password still works", async () => {
    const author = seededViewer("author");
    await askForReset(api, author.email);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const response = await postSetPassword(api, tokenMailedTo(api, author.email));

    expect(response.status).toBe(401);
    expect((await postLogin(api, { email: author.email, password: author.password })).status).toBe(
      200,
    );
  });
});
