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
  unknownQuestionId,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

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
  const restricted = seededQuestionIds.aboutTheClientsPipeline;

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

  it("cannot reach that Client's Questions, on the token the Viewer already held", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const readerToken = await logIn(api, seededViewer("reader"));
    // Reached before, so "cannot reach after" is the revocation and not the seed.
    expect((await getQuestion(api, restricted, readerToken)).status).toBe(200);
    expect(await questionIdsListed(readerToken)).toContain(restricted);

    const revoked = await deleteGrant(api, clientId, reader.id, administratorToken);
    expect(revoked.status).toBe(204);

    expect(await statusAndBody(await getQuestion(api, restricted, readerToken))).toBe(
      await statusAndBody(await getQuestion(api, unknownQuestionId, readerToken)),
    );
    expect(await questionIdsListed(readerToken)).not.toContain(restricted);
    expect(await clientNamesListed(api, readerToken)).toEqual([]);
  });

  it("answers an Author's own Question under that Client as one that does not exist", async () => {
    // The seeded Author wrote every seeded Question, the restricted one included.
    const author = await viewerByRole(api.database, "author");
    const authorToken = await logIn(api, seededViewer("author"));
    const question = await api.database.question.findUniqueOrThrow({ where: { id: restricted } });
    expect(question.authorId).toBe(author.id);
    expect(question.clientId).toBe(clientId);
    expect((await getQuestion(api, restricted, authorToken)).status).toBe(200);

    await deleteGrant(api, clientId, author.id, administratorToken);

    expect(await statusAndBody(await getQuestion(api, restricted, authorToken))).toBe(
      await statusAndBody(await getQuestion(api, unknownQuestionId, authorToken)),
    );
  });

  it("leaves the Viewer's other Grants working", async () => {
    // Issued here, so that revoking it leaves the Reviewer's Grant for the second Client.
    const reviewer = await viewerByRole(api.database, "reviewer");
    await api.database.permissionGrant.create({ data: { viewerId: reviewer.id, clientId } });

    await deleteGrant(api, clientId, reviewer.id, administratorToken);

    expect(await clientNamesListed(api, administratorToken)).toEqual([seedOtherClient.name]);
    const ids = await questionIdsListed(administratorToken);
    expect(ids).toContain(seededQuestionIds.aboutTheOtherClientsBooking);
    expect(ids).not.toContain(restricted);
  });
});
