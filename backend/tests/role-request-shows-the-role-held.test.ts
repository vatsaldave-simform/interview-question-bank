import {
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  type ViewerRole,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import {
  getRoleRequestQueue,
  myRoleRequests,
  postDecision,
  postRoleRequest,
  raisedRoleRequestId,
} from "./helpers/role-requests.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

describe("the role a Role Request shows its asker holding", () => {
  let api: TestApi;
  let administratorToken: string;
  let readerToken: string;
  let readerId: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    readerToken = await logIn(api, seededViewer("reader"));
    readerId = (await viewerByRole(api.database, "reader")).id;
  });
  afterAll(async () => {
    await api.stop();
  });

  const raise = (role: ViewerRole) => raisedRoleRequestId(api, role, readerToken);

  async function theQueue() {
    const response = await getRoleRequestQueue(api, administratorToken);
    return roleRequestListResponseSchema.parse(await response.json()).roleRequests;
  }

  /** Set by an Administrator directly, not through the Role Request. */
  async function setTheReadersRole(role: ViewerRole): Promise<void> {
    const response = await api.request(`/api/viewers/${readerId}/role`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${administratorToken}`,
      },
      body: JSON.stringify({ role }),
    });
    if (response.status !== 200) {
      throw new Error(`Setting the role failed with ${response.status}.`);
    }
  }

  it.each<[ViewerRole, ViewerRole]>([
    ["reader", "author"],
    ["author", "reviewer"],
    ["reviewer", "reader"],
  ])("is beside the role asked for when a %s raises it", async (held, asked) => {
    const token = await logIn(api, seededViewer(held));

    const response = await postRoleRequest(api, { role: asked }, token);

    const { roleRequest } = roleRequestResponseSchema.parse(await response.json());
    expect([roleRequest.heldRole, roleRequest.role]).toEqual([held, asked]);
  });

  it("is shown to the Viewer who asked, in their own list", async () => {
    await raise("author");

    const [mine] = await myRoleRequests(api, readerToken);

    expect([mine?.heldRole, mine?.role]).toEqual(["reader", "author"]);
  });

  it("is shown to an Administrator, in the open list", async () => {
    const id = await raise("author");

    const queued = (await theQueue()).find((roleRequest) => roleRequest.id === id);

    expect([queued?.heldRole, queued?.role]).toEqual(["reader", "author"]);
  });

  it("is the role held when the list is read, not when the Role Request was raised", async () => {
    const id = await raise("reviewer");
    await setTheReadersRole("author");

    const [mine] = await myRoleRequests(api, readerToken);
    const queued = (await theQueue()).find((roleRequest) => roleRequest.id === id);

    expect(mine?.heldRole).toBe("author");
    expect(queued?.heldRole).toBe("author");
  });

  it("is the role just granted, in the answer to a grant", async () => {
    const id = await raise("author");

    const response = await postDecision(api, id, { outcome: "granted" }, administratorToken);

    const { roleRequest } = roleRequestResponseSchema.parse(await response.json());
    expect(roleRequest.heldRole).toBe("author");
  });

  it("is the role still held, in the answer to a denial", async () => {
    const id = await raise("author");

    const response = await postDecision(
      api,
      id,
      { outcome: "denied", reason: "Not this quarter." },
      administratorToken,
    );

    const { roleRequest } = roleRequestResponseSchema.parse(await response.json());
    expect(roleRequest.heldRole).toBe("reader");
  });
});
