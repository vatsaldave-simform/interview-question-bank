import { apiErrorSchema, questionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { clientNamesListed, deleteGrant, unknownId } from "./helpers/clients.ts";
import {
  clientIdNamed,
  getQuestion,
  getQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function grantRevokedEvents(api: TestApi) {
  return api.database.changeEvent.findMany({ where: { type: "permission_grant_revoked" } });
}

describe("revoking a Permission Grant", () => {
  let api: TestApi;
  let administratorToken: string;
  let clientId: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    clientId = await clientIdNamed(api.database, seedClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("removes the Grant", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await deleteGrant(api, clientId, reader.id, administratorToken);

    expect(response.status).toBe(204);
    expect(
      await api.database.permissionGrant.count({ where: { viewerId: reader.id, clientId } }),
    ).toBe(0);
  });

  it("records the revocation under the acting Administrator's name", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const administrator = await viewerByRole(api.database, "reviewer");

    await deleteGrant(api, clientId, reader.id, administratorToken);

    const events = await grantRevokedEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]?.questionId).toBeNull();
    expect(events[0]?.viewerId).toBe(administrator.id);
    expect(events[0]?.payload).toEqual({
      grant: {
        client: { id: clientId, name: seedClient.name },
        viewer: { id: reader.id, email: reader.email },
      },
    });
  });

  it("answers a Grant the Viewer does not hold as not found, and records nothing", async () => {
    // The Reader holds a Grant for the first Client only.
    const reader = await viewerByRole(api.database, "reader");
    const otherClientId = await clientIdNamed(api.database, seedOtherClient.name);

    const response = await deleteGrant(api, otherClientId, reader.id, administratorToken);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
    expect(await grantRevokedEvents(api)).toHaveLength(0);
  });

  it("answers a Grant revoked twice as not found the second time", async () => {
    const reader = await viewerByRole(api.database, "reader");

    await deleteGrant(api, clientId, reader.id, administratorToken);
    const second = await deleteGrant(api, clientId, reader.id, administratorToken);

    expect(second.status).toBe(404);
    expect(await grantRevokedEvents(api)).toHaveLength(1);
  });

  it("answers a Client that does not exist as not found", async () => {
    const reader = await viewerByRole(api.database, "reader");

    const response = await deleteGrant(api, unknownId, reader.id, administratorToken);

    expect(response.status).toBe(404);
  });

  it("refuses a Viewer id that is not an id", async () => {
    const response = await deleteGrant(api, clientId, "not-an-id", administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("refuses a Viewer who is not an Administrator, and revokes nothing", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const authorToken = await logIn(api, seededViewer("author"));

    const response = await deleteGrant(api, clientId, reader.id, authorToken);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    expect(
      await api.database.permissionGrant.count({ where: { viewerId: reader.id, clientId } }),
    ).toBe(1);
    expect(await grantRevokedEvents(api)).toHaveLength(0);
  });
});

/** Each Viewer keeps the access token they held before the revoke, because a fresh login
 * would prove nothing about the very next request. */
describe("the next request after a Grant is revoked", () => {
  let api: TestApi;
  let administratorToken: string;
  let clientId: string;
  const named = seededQuestionIds.aboutTheClientsPipeline;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    administratorToken = await logIn(api, seededViewer("reviewer"));
    clientId = await clientIdNamed(api.database, seedClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  async function questionIdsListed(token: string): Promise<string[]> {
    const response = await getQuestions(api, {}, token);
    return questionListResponseSchema.parse(await response.json()).questions.map(({ id }) => id);
  }

  // A Client hides nothing any more (ADR-0050), so a revoked Grant takes nothing out of sight.
  it("leaves that Client's Questions in reach, on the token the Viewer already held", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const readerToken = await logIn(api, seededViewer("reader"));

    const revoked = await deleteGrant(api, clientId, reader.id, administratorToken);
    expect(revoked.status).toBe(204);

    expect((await getQuestion(api, named, readerToken)).status).toBe(200);
    expect(await questionIdsListed(readerToken)).toContain(named);
    expect(await clientNamesListed(api, readerToken)).toEqual([
      seedOtherClient.name,
      seedClient.name,
    ]);
  });
});
