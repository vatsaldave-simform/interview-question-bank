import {
  apiErrorSchema,
  currentViewerResponseSchema,
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  type Viewer,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  denyRoleRequest,
  grantRoleRequest,
} from "../src/features/role-requests/role-requests.service.ts";
import { lockViewer, setRole } from "../src/features/viewers/viewers.repository.ts";
import { ConflictError } from "../src/platform/errors.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { unknownId } from "./helpers/clients.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import {
  getRoleRequestQueue,
  myRoleRequests,
  postDecision,
  postRoleRequest,
  raisedRoleRequestId,
} from "./helpers/role-requests.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";
import { untilARowLockIsWaitedOn } from "./helpers/test-database.ts";
import { aMomentLater } from "./helpers/wait.ts";

// Each race is run several times, because one run can happen not to interleave.
const rounds = 5;

function decisionEvents(api: TestApi) {
  return api.database.changeEvent.findMany({
    where: { type: { in: ["role_request_granted", "role_request_denied"] } },
  });
}

async function currentRole(api: TestApi, token: string): Promise<string> {
  const response = await api.request("/api/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  return currentViewerResponseSchema.parse(await response.json()).viewer.role;
}

describe("deciding a Role Request", () => {
  let api: TestApi;
  let administratorToken: string;
  let administratorId: string;
  let readerToken: string;
  let authorToken: string;
  let reader: Viewer;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    administratorId = (await viewerByRole(api.database, "reviewer")).id;
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reader = await viewerByRole(api.database, "reader");
  });
  afterAll(async () => {
    await api.stop();
  });

  describe("by a Viewer who is not an Administrator", () => {
    it("refuses them the queue", async () => {
      await raisedRoleRequestId(api, "reviewer", readerToken);

      const response = await getRoleRequestQueue(api, authorToken);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    });

    it("refuses them a decision, even on their own Role Request", async () => {
      const id = await raisedRoleRequestId(api, "reviewer", authorToken);

      const response = await postDecision(api, id, { outcome: "granted" }, authorToken);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
      expect(await currentRole(api, authorToken)).toBe("author");
    });
  });

  it("shows an Administrator the open Role Requests, oldest first", async () => {
    const decided = await raisedRoleRequestId(api, "author", readerToken);
    await postDecision(api, decided, { outcome: "denied", reason: "Not yet." }, administratorToken);
    await aMomentLater();
    const older = await raisedRoleRequestId(api, "reviewer", authorToken);
    await aMomentLater();
    const newer = await raisedRoleRequestId(api, "reviewer", readerToken);

    const response = await getRoleRequestQueue(api, administratorToken);

    expect(response.status).toBe(200);
    const { roleRequests } = roleRequestListResponseSchema.parse(await response.json());
    expect(roleRequests.map(({ id }) => id)).toEqual([older, newer]);
  });

  it("changes the requester's role when it is granted", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);

    const response = await postDecision(api, id, { outcome: "granted" }, administratorToken);

    expect(response.status).toBe(200);
    const { roleRequest } = roleRequestResponseSchema.parse(await response.json());
    expect(roleRequest).toMatchObject({ id, state: "granted", reason: null });
    expect(roleRequest.decidedAt).not.toBeNull();
    // On the requester's very next request, with the token they already held.
    expect(await currentRole(api, readerToken)).toBe("reviewer");
  });

  it("keeps a reason an Administrator gives with a grant", async () => {
    const id = await raisedRoleRequestId(api, "author", readerToken);

    await postDecision(api, id, { outcome: "granted", reason: "Welcome aboard." }, administratorToken);

    const [mine] = await myRoleRequests(api, readerToken);
    expect(mine).toMatchObject({ state: "granted", reason: "Welcome aboard." });
  });

  it("lets the requester read why their Role Request was denied", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);

    const response = await postDecision(
      api,
      id,
      { outcome: "denied", reason: "Review a few Questions as an Author first." },
      administratorToken,
    );

    expect(response.status).toBe(200);
    const [mine] = await myRoleRequests(api, readerToken);
    expect(mine).toMatchObject({
      id,
      state: "denied",
      reason: "Review a few Questions as an Author first.",
    });
    expect(await currentRole(api, readerToken)).toBe("reader");
  });

  it("lets the requester raise a new Role Request after a denial", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);
    await postDecision(api, id, { outcome: "denied", reason: "Not yet." }, administratorToken);

    const response = await postRoleRequest(api, { role: "reviewer" }, readerToken);

    expect(response.status).toBe(201);
  });

  it.each([
    ["a denial with no reason", { outcome: "denied" }],
    ["a denial whose reason is only spaces", { outcome: "denied", reason: "   " }],
    ["an outcome that does not exist", { outcome: "withdrawn" }],
    ["a field it does not know", { outcome: "granted", role: "reviewer" }],
  ])("refuses %s, and leaves the Role Request open", async (_, body) => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);

    const response = await postDecision(api, id, body, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    const [mine] = await myRoleRequests(api, readerToken);
    expect(mine?.state).toBe("open");
  });

  it("refuses to decide a Role Request a second time", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);
    await postDecision(api, id, { outcome: "denied", reason: "Not yet." }, administratorToken);

    const response = await postDecision(api, id, { outcome: "granted" }, administratorToken);

    expect(response.status).toBe(409);
    expect(await currentRole(api, readerToken)).toBe("reader");
    expect(await decisionEvents(api)).toHaveLength(1);
  });

  it("answers 404 for a Role Request that does not exist", async () => {
    const response = await postDecision(api, unknownId, { outcome: "granted" }, administratorToken);

    expect(response.status).toBe(404);
  });

  it("answers 400 for an id that is not one", async () => {
    const response = await postDecision(api, "not-an-id", { outcome: "granted" }, administratorToken);

    expect(response.status).toBe(400);
  });

  it("records a grant as a Change Event naming the Administrator who decided", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);

    await postDecision(api, id, { outcome: "granted" }, administratorToken);

    const events = await decisionEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "role_request_granted",
      questionId: null,
      viewerId: administratorId,
      payload: {
        roleRequestId: id,
        viewer: { id: reader.id, email: reader.email },
        role: { before: "reader", after: "reviewer" },
        reason: null,
      },
    });
  });

  it("records a denial as a Change Event carrying the reason", async () => {
    const id = await raisedRoleRequestId(api, "reviewer", readerToken);

    await postDecision(api, id, { outcome: "denied", reason: "Not yet." }, administratorToken);

    const events = await decisionEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "role_request_denied",
      questionId: null,
      viewerId: administratorId,
      payload: {
        roleRequestId: id,
        viewer: { id: reader.id, email: reader.email },
        role: "reviewer",
        reason: "Not yet.",
      },
    });
  });

  /** Called on the service twice at once, as `administrator-races.test.ts` does (ADR-0039). */
  describe("by two Administrators at the same moment", () => {
    async function aSecondAdministrator(): Promise<Viewer> {
      const author = await viewerByRole(api.database, "author");
      await api.database.viewer.update({ where: { id: author.id }, data: { isAdministrator: true } });
      return { ...author, isAdministrator: true };
    }

    it("lets only one of a grant and a denial through, and records one Change Event", async () => {
      for (let round = 0; round < rounds; round++) {
        await seedTheBank(api.database);
        const first = await viewerByRole(api.database, "reviewer");
        const second = await aSecondAdministrator();
        const requestingViewer = await viewerByRole(api.database, "reader");
        const id = await raisedRoleRequestId(
          api,
          "reviewer",
          await logIn(api, seededViewer("reader")),
        );

        const results = await Promise.allSettled([
          grantRoleRequest(api.database, first, id, null),
          denyRoleRequest(api.database, second, id, "Not yet."),
        ]);

        const refused = results.filter((result) => result.status === "rejected");
        expect(refused).toHaveLength(1);
        expect(refused[0]?.reason).toBeInstanceOf(ConflictError);
        const events = await decisionEvents(api);
        expect(events).toHaveLength(1);
        // The role is the one the decision that won says it is.
        const stored = await api.database.viewer.findUniqueOrThrow({ where: { id: requestingViewer.id } });
        expect(stored.role).toBe(events[0]?.type === "role_request_granted" ? "reviewer" : "reader");
      }
    });

    // Held in place by hand, because the grant has to arrive while a direct role change has
    // written the role and not yet committed, which two requests sent together rarely meet.
    it("records the role a grant replaced, not the one before a role change under way", async () => {
      const administrator = await viewerByRole(api.database, "reviewer");
      const requestingViewer = await viewerByRole(api.database, "reader");
      const id = await raisedRoleRequestId(api, "reviewer", readerToken);
      const roleWritten = Promise.withResolvers<void>();
      const goOn = Promise.withResolvers<void>();

      // What `changeRole` does to its target, stopped before it commits.
      const roleChange = api.database.$transaction(async (transaction) => {
        await lockViewer(transaction, requestingViewer.id);
        await setRole(transaction, requestingViewer.id, "author");
        roleWritten.resolve();
        await goOn.promise;
      });
      await roleWritten.promise;
      const grant = grantRoleRequest(api.database, administrator, id, null);
      await untilARowLockIsWaitedOn(api.database);
      goOn.resolve();
      await Promise.all([roleChange, grant]);

      const [event] = await decisionEvents(api);
      expect(event?.payload).toMatchObject({ role: { before: "author", after: "reviewer" } });
      expect((await viewerByRole(api.database, "reader")).role).toBe("reviewer");
    });
  });
});
