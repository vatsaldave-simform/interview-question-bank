import { apiErrorSchema, viewerResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, postLogin, seededViewer } from "./helpers/auth.ts";
import { refreshCookieHeader, refreshCookieValue } from "./helpers/cookies.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function deactivate(api: TestApi, targetId: string, token: string): Promise<Response> {
  return api.request(`/api/viewers/${targetId}/deactivation`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

function reactivate(api: TestApi, targetId: string, token: string): Promise<Response> {
  return api.request(`/api/viewers/${targetId}/deactivation`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
}

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

function refresh(api: TestApi, token: string): Promise<Response> {
  return api.request("/api/auth/refresh", { method: "POST", headers: refreshCookieHeader(token) });
}

/** The events an administrative act left, most recent first. */
function administrativeEvents(api: TestApi) {
  return api.database.changeEvent.findMany({
    where: { questionId: null },
    orderBy: { createdAt: "desc" },
  });
}

describe("Deactivating and reactivating a Viewer", () => {
  let api: TestApi;
  let administratorToken: string;
  let administratorId: string;
  let authorId: string;
  let readerId: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    administratorId = (await viewerByRole(api.database, "reviewer")).id;
    authorId = (await viewerByRole(api.database, "author")).id;
    readerId = (await viewerByRole(api.database, "reader")).id;
  });
  afterAll(async () => {
    await api.stop();
  });

  describe("refusing a Viewer without the authority", () => {
    it("refuses deactivating", async () => {
      const authorToken = await logIn(api, seededViewer("author"));

      const response = await deactivate(api, readerId, authorToken);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
      expect((await viewerByRole(api.database, "reader")).isDeactivated).toBe(false);
    });

    it("refuses reactivating", async () => {
      await deactivate(api, readerId, administratorToken);
      const authorToken = await logIn(api, seededViewer("author"));

      const response = await reactivate(api, readerId, authorToken);

      expect(response.status).toBe(403);
      expect((await viewerByRole(api.database, "reader")).isDeactivated).toBe(true);
    });
  });

  it("refuses a route naming a Viewer who does not exist", async () => {
    const response = await deactivate(api, "b0000000-0000-4000-8000-00000000ffff", administratorToken);

    expect(response.status).toBe(404);
  });

  it("offers no way to delete a Viewer", async () => {
    const response = await api.request(`/api/viewers/${authorId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${administratorToken}` },
    });

    expect(response.status).toBe(404);
    expect(await api.database.viewer.count({ where: { id: authorId } })).toBe(1);
  });

  describe("deactivating", () => {
    it("answers the Viewer as Deactivated, recorded under the acting Administrator's name", async () => {
      const response = await deactivate(api, authorId, administratorToken);

      expect(response.status).toBe(200);
      const body = viewerResponseSchema.parse(await response.json());
      expect(body.viewer).toMatchObject({ id: authorId, isDeactivated: true });

      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("viewer_deactivated");
      expect(event?.viewerId).toBe(administratorId);
      expect(event?.payload).toEqual({ viewer: { id: authorId, email: seededViewer("author").email } });
    });

    it("records nothing the second time", async () => {
      await deactivate(api, authorId, administratorToken);
      const before = await administrativeEvents(api);

      const response = await deactivate(api, authorId, administratorToken);

      expect(response.status).toBe(200);
      expect(viewerResponseSchema.parse(await response.json()).viewer.isDeactivated).toBe(true);
      expect(await administrativeEvents(api)).toEqual(before);
    });

    it("refuses the Viewer's existing refresh token at the next rotation", async () => {
      const login = await postLogin(api, {
        email: seededViewer("author").email,
        password: seededViewer("author").password,
      });
      const refreshToken = refreshCookieValue(login);

      await deactivate(api, authorId, administratorToken);
      const response = await refresh(api, refreshToken);

      expect(response.status).toBe(401);
      const live = await api.database.refreshToken.count({
        where: { viewerId: authorId, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it("leaves another Viewer's session alone", async () => {
      const login = await postLogin(api, {
        email: seededViewer("reader").email,
        password: seededViewer("reader").password,
      });

      await deactivate(api, authorId, administratorToken);
      const response = await refresh(api, refreshCookieValue(login));

      expect(response.status).toBe(200);
    });
  });

  describe("the last Administrator", () => {
    it("refuses deactivating the last remaining Administrator", async () => {
      const before = await administrativeEvents(api);

      const response = await deactivate(api, administratorId, administratorToken);

      expect(response.status).toBe(409);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
      expect((await viewerByRole(api.database, "reviewer")).isDeactivated).toBe(false);
      expect(await administrativeEvents(api)).toEqual(before);
    });

    it("deactivates an Administrator while another active one remains", async () => {
      await appoint(api, readerId, administratorToken);

      const response = await deactivate(api, administratorId, administratorToken);

      expect(response.status).toBe(200);
    });

    it("refuses withdrawing the last active Administrator while the other one is Deactivated", async () => {
      await appoint(api, readerId, administratorToken);
      await deactivate(api, readerId, administratorToken);

      const response = await withdraw(api, administratorId, administratorToken);

      expect(response.status).toBe(409);
      expect((await viewerByRole(api.database, "reviewer")).isAdministrator).toBe(true);
    });

    it("withdraws the authority from a Deactivated Administrator", async () => {
      await appoint(api, readerId, administratorToken);
      await deactivate(api, readerId, administratorToken);

      const response = await withdraw(api, readerId, administratorToken);

      expect(response.status).toBe(200);
      expect(viewerResponseSchema.parse(await response.json()).viewer.isAdministrator).toBe(false);
    });
  });

  describe("reactivating", () => {
    it("answers the Viewer as active again, recorded under the acting Administrator's name", async () => {
      await deactivate(api, authorId, administratorToken);

      const response = await reactivate(api, authorId, administratorToken);

      expect(response.status).toBe(200);
      const body = viewerResponseSchema.parse(await response.json());
      expect(body.viewer).toMatchObject({ id: authorId, isDeactivated: false });

      const [event] = await administrativeEvents(api);
      expect(event?.type).toBe("viewer_reactivated");
      expect(event?.viewerId).toBe(administratorId);
      expect(event?.payload).toEqual({ viewer: { id: authorId, email: seededViewer("author").email } });
    });

    it("records nothing for a Viewer who was never Deactivated", async () => {
      const before = await administrativeEvents(api);

      const response = await reactivate(api, authorId, administratorToken);

      expect(response.status).toBe(200);
      expect(await administrativeEvents(api)).toEqual(before);
    });
  });
});
