import { apiErrorSchema, viewerResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { getQuestion, seedTheBank, seededQuestionIds, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function appoint(api: TestApi, targetId: string, token: string): Promise<Response> {
  return api.request(`/api/viewers/${targetId}/administrator`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

function withdraw(api: TestApi, targetId: string, token: string): Promise<Response> {
  return api.request(`/api/viewers/${targetId}/administrator`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
}

function changeRole(api: TestApi, targetId: string, role: string, token: string): Promise<Response> {
  return api.request(`/api/viewers/${targetId}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
}

/** The events an administrative act left, most recent first. */
async function administrativeEvents(api: TestApi) {
  return api.database.changeEvent.findMany({
    where: { questionId: null },
    orderBy: { createdAt: "desc" },
  });
}

describe("Administrator authority", () => {
  let api: TestApi;
  let administratorToken: string;
  let administratorId: string;
  let readerId: string;
  let authorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    administratorId = (await viewerByRole(api.database, "reviewer")).id;
    readerId = (await viewerByRole(api.database, "reader")).id;
    authorToken = await logIn(api, seededViewer("author"));
  });
  afterAll(async () => {
    await api.stop();
  });

  describe("refusing a Viewer without the authority", () => {
    it("refuses appointing", async () => {
      const response = await appoint(api, readerId, authorToken);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    });

    it("refuses withdrawing", async () => {
      const response = await withdraw(api, administratorId, authorToken);

      expect(response.status).toBe(403);
    });

    it("refuses setting a role directly", async () => {
      const response = await changeRole(api, readerId, "author", authorToken);

      expect(response.status).toBe(403);
    });
  });

  describe("appointing and withdrawing", () => {
    it("appoints another Viewer, recorded under the acting Administrator's name", async () => {
      const response = await appoint(api, readerId, administratorToken);

      expect(response.status).toBe(200);
      const body = viewerResponseSchema.parse(await response.json());
      expect(body.viewer.isAdministrator).toBe(true);

      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("administrator_appointed");
      expect(event?.viewerId).toBe(administratorId);
      expect(event?.payload).toEqual({ viewer: { id: readerId, email: seededViewer("reader").email } });
    });

    it("withdraws a non-last Administrator's authority", async () => {
      await appoint(api, readerId, administratorToken);

      const response = await withdraw(api, administratorId, administratorToken);

      expect(response.status).toBe(200);
      const body = viewerResponseSchema.parse(await response.json());
      expect(body.viewer.isAdministrator).toBe(false);

      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("administrator_withdrawn");
      expect(event?.viewerId).toBe(administratorId);
    });

    it("refuses withdrawing the last remaining Administrator", async () => {
      const before = await administrativeEvents(api);

      const response = await withdraw(api, administratorId, administratorToken);

      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
      const viewer = await viewerByRole(api.database, "reviewer");
      expect(viewer.isAdministrator).toBe(true);
      expect(await administrativeEvents(api)).toEqual(before);
    });

    it("refuses a route naming a Viewer who does not exist", async () => {
      const response = await appoint(api, "b0000000-0000-4000-8000-00000000ffff", administratorToken);

      expect(response.status).toBe(404);
    });
  });

  describe("setting a role directly", () => {
    it("changes a Viewer's role without a Role Request, recording the before and after", async () => {
      const response = await changeRole(api, readerId, "author", administratorToken);

      expect(response.status).toBe(200);
      const body = viewerResponseSchema.parse(await response.json());
      expect(body.viewer.role).toBe("author");

      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("role_changed");
      expect(event?.viewerId).toBe(administratorId);
      expect(event?.payload).toMatchObject({ role: { before: "reader", after: "author" } });
    });

    it("lets an Administrator escalate their own role, in the open", async () => {
      // The seeded Administrator appoints the Reader, who then grants themselves the
      // Reviewer role: self-escalation is permitted, never silent (ADR-0015).
      await appoint(api, readerId, administratorToken);
      const readerToken = await logIn(api, seededViewer("reader"));

      const response = await changeRole(api, readerId, "reviewer", readerToken);

      expect(response.status).toBe(200);
      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("role_changed");
      expect(event?.viewerId).toBe(readerId);
      expect(event?.payload).toMatchObject({ role: { before: "reader", after: "reviewer" } });
    });
  });

  it("gives an Administrator who is a Reader no more reach than any other Reader", async () => {
    await appoint(api, readerId, administratorToken);
    const readerAdministratorToken = await logIn(api, seededViewer("reader"));

    // Restricted to the second Client, which the Reader holds no Permission Grant for.
    const response = await getQuestion(
      api,
      seededQuestionIds.aboutTheOtherClientsBooking,
      readerAdministratorToken,
    );

    expect(response.status).toBe(404);
  });
});
