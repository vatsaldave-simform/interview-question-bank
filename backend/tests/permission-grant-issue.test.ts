import {
  apiErrorSchema,
  permissionGrantListResponseSchema,
  permissionGrantResponseSchema,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { deleteGrant, getGrants, postGrant, unknownId } from "./helpers/clients.ts";
import { clientIdNamed, seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function grantIssuedEvents(api: TestApi) {
  return api.database.changeEvent.findMany({ where: { type: "permission_grant_issued" } });
}

describe("issuing a Permission Grant", () => {
  let api: TestApi;
  let administratorToken: string;
  let authorToken: string;
  // The Reader holds no Grant for it, so issuing them one is new.
  let otherClientId: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    authorToken = await logIn(api, seededViewer("author"));
    otherClientId = await clientIdNamed(api.database, seedOtherClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("issues a Grant and answers with it", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await postGrant(api, otherClientId, { viewerId: reader.id }, administratorToken);

    expect(response.status).toBe(201);
    expect(permissionGrantResponseSchema.parse(await response.json())).toEqual({
      grant: {
        client: { id: otherClientId, name: seedOtherClient.name },
        viewer: { id: reader.id, email: reader.email },
      },
    });
    const stored = await api.database.permissionGrant.count({
      where: { viewerId: reader.id, clientId: otherClientId },
    });
    expect(stored).toBe(1);
  });

  it("records the Grant under the acting Administrator's name", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const administrator = await viewerByRole(api.database, "reviewer");

    await postGrant(api, otherClientId, { viewerId: reader.id }, administratorToken);

    const events = await grantIssuedEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]?.questionId).toBeNull();
    expect(events[0]?.viewerId).toBe(administrator.id);
    expect(events[0]?.payload).toEqual({
      grant: {
        client: { id: otherClientId, name: seedOtherClient.name },
        viewer: { id: reader.id, email: reader.email },
      },
    });
  });

  it("lets an Administrator issue a Grant to themselves, and records it", async () => {
    const administrator = await viewerByRole(api.database, "reviewer");
    const clientId = await clientIdNamed(api.database, seedClient.name);

    const response = await postGrant(
      api,
      clientId,
      { viewerId: administrator.id },
      administratorToken,
    );

    expect(response.status).toBe(201);
    const events = await grantIssuedEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]?.viewerId).toBe(administrator.id);
    expect(events[0]?.payload).toEqual({
      grant: {
        client: { id: clientId, name: seedClient.name },
        viewer: { id: administrator.id, email: administrator.email },
      },
    });
  });

  it("refuses a Grant the Viewer already holds for that Client, and records nothing", async () => {
    const author = await viewerByRole(api.database, "author");
    const clientId = await clientIdNamed(api.database, seedClient.name);

    const response = await postGrant(api, clientId, { viewerId: author.id }, administratorToken);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
    expect(await api.database.permissionGrant.count({ where: { viewerId: author.id, clientId } })).toBe(1);
    expect(await grantIssuedEvents(api)).toHaveLength(0);
  });

  it("refuses a Viewer who is not an Administrator, and issues nothing", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await postGrant(api, otherClientId, { viewerId: reader.id }, authorToken);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    expect(
      await api.database.permissionGrant.count({
        where: { viewerId: reader.id, clientId: otherClientId },
      }),
    ).toBe(0);
    expect(await grantIssuedEvents(api)).toHaveLength(0);
  });

  it("answers a Client that does not exist as not found", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await postGrant(api, unknownId, { viewerId: reader.id }, administratorToken);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("refuses a Client id that is not an id", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await postGrant(api, "not-an-id", { viewerId: reader.id }, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("refuses a Viewer that does not exist, and records nothing", async () => {
    const response = await postGrant(api, otherClientId, { viewerId: unknownId }, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    expect(await grantIssuedEvents(api)).toHaveLength(0);
  });

  it.each([
    ["no Viewer", {}],
    ["a Viewer id that is not an id", { viewerId: "not-an-id" }],
    ["a field it does not know", { viewerId: unknownId, clientId: unknownId }],
  ])("refuses %s", async (_, body) => {
    const response = await postGrant(api, otherClientId, body, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});

describe("listing the Grants held against a Client", () => {
  let api: TestApi;
  let administratorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    administratorToken = await logIn(api, seededViewer("reviewer"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("lists exactly that Client's Grants, in email order", async () => {
    const clientId = await clientIdNamed(api.database, seedClient.name);
    const author = await viewerByRole(api.database, "author");
    const reader = await viewerByRole(api.database, "reader");
    const client = { id: clientId, name: seedClient.name };

    const response = await getGrants(api, clientId, administratorToken);

    expect(response.status).toBe(200);
    expect(permissionGrantListResponseSchema.parse(await response.json())).toEqual({
      grants: [
        { client, viewer: { id: author.id, email: author.email } },
        { client, viewer: { id: reader.id, email: reader.email } },
      ],
    });
  });

  it("answers a Client no one holds a Grant for with an empty list", async () => {
    // The Reviewer is the only one holding a Grant for the second Client.
    const clientId = await clientIdNamed(api.database, seedOtherClient.name);
    const reviewer = await viewerByRole(api.database, "reviewer");
    expect((await deleteGrant(api, clientId, reviewer.id, administratorToken)).status).toBe(204);

    const response = await getGrants(api, clientId, administratorToken);

    expect(permissionGrantListResponseSchema.parse(await response.json())).toEqual({ grants: [] });
  });

  it("does not need the Administrator to hold a Grant for the Client", async () => {
    // The Administrator holds none for the first Client, and still sees who does.
    const clientId = await clientIdNamed(api.database, seedClient.name);

    const response = await getGrants(api, clientId, administratorToken);

    const { grants } = permissionGrantListResponseSchema.parse(await response.json());
    expect(grants).toHaveLength(2);
  });

  it("answers a Client that does not exist as not found", async () => {
    const response = await getGrants(api, unknownId, administratorToken);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });

  it("refuses a Viewer who is not an Administrator", async () => {
    const clientId = await clientIdNamed(api.database, seedClient.name);
    const authorToken = await logIn(api, seededViewer("author"));

    const response = await getGrants(api, clientId, authorToken);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });
});
