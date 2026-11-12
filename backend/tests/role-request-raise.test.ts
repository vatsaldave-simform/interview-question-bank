import { apiErrorSchema, roleRequestResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInAsAnother, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { myRoleRequests, postRoleRequest } from "./helpers/role-requests.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

// The race is run several times, because one run can happen not to interleave.
const rounds = 5;

describe("raising a Role Request", () => {
  let api: TestApi;
  let authorToken: string;
  let authorId: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    authorId = (await viewerByRole(api.database, "author")).id;
  });
  afterAll(async () => {
    await api.stop();
  });

  it("lets a Reader ask for Reviewer directly, with no Author step between", async () => {
    const readerToken = await logIn(api, seededViewer("reader"));
    const readerId = (await viewerByRole(api.database, "reader")).id;

    const response = await postRoleRequest(api, { role: "reviewer" }, readerToken);

    expect(response.status).toBe(201);
    const { roleRequest } = roleRequestResponseSchema.parse(await response.json());
    expect(roleRequest).toMatchObject({
      viewer: { id: readerId, email: seededViewer("reader").email },
      role: "reviewer",
      state: "open",
      reason: null,
      decidedAt: null,
    });
  });

  it("leaves the Viewer's role as it was until an Administrator decides", async () => {
    await postRoleRequest(api, { role: "reviewer" }, authorToken);

    expect((await viewerByRole(api.database, "author")).role).toBe("author");
  });

  it("records no Change Event, because only a decision is one", async () => {
    await postRoleRequest(api, { role: "reviewer" }, authorToken);

    expect(await api.database.changeEvent.count({ where: { questionId: null } })).toBe(0);
  });

  it("refuses a second Role Request while the first is open", async () => {
    await postRoleRequest(api, { role: "reviewer" }, authorToken);

    const response = await postRoleRequest(api, { role: "reviewer" }, authorToken);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
    expect(await api.database.roleRequest.count()).toBe(1);
  });

  it("lets exactly one of many Role Requests sent at once in", async () => {
    for (let round = 0; round < rounds; round++) {
      await api.database.roleRequest.deleteMany();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => postRoleRequest(api, { role: "reviewer" }, authorToken)),
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
      expect(await api.database.roleRequest.count({ where: { viewerId: authorId } })).toBe(1);
    }
  });

  it("refuses a Role Request for the role the Viewer already holds", async () => {
    const response = await postRoleRequest(api, { role: "author" }, authorToken);

    expect(response.status).toBe(409);
    expect(await api.database.roleRequest.count()).toBe(0);
  });

  it.each([
    ["no role", {}],
    ["a role that does not exist", { role: "owner" }],
    ["Administrator, which is not a role", { role: "administrator" }],
    ["a field it does not know", { role: "author", reason: "please" }],
  ])("refuses a body with %s", async (_, body) => {
    const response = await postRoleRequest(api, body, authorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    expect(await api.database.roleRequest.count()).toBe(0);
  });

  it("shows a Viewer their own Role Requests and nobody else's", async () => {
    await postRoleRequest(api, { role: "reviewer" }, authorToken);
    await postRoleRequest(api, { role: "reviewer" }, await logInAsAnother(api, "author"));

    const mine = await myRoleRequests(api, authorToken);

    expect(mine).toHaveLength(1);
    expect(mine[0]?.viewer.id).toBe(authorId);
  });

  it("shows a Viewer who never asked an empty list", async () => {
    expect(await myRoleRequests(api, authorToken)).toEqual([]);
  });
});
