import { apiErrorSchema, viewerListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function getViewers(api: TestApi, token: string): Promise<Response> {
  return api.request("/api/viewers", { headers: { authorization: `Bearer ${token}` } });
}

describe("listing Viewers", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("shows an Administrator every Viewer, in email order", async () => {
    const token = await logIn(api, seededViewer("reviewer"));

    const response = await getViewers(api, token);

    expect(response.status).toBe(200);
    const { viewers } = viewerListResponseSchema.parse(await response.json());
    expect(viewers.map(({ id: _id, ...rest }) => rest)).toEqual([
      { email: "author@iqb.test", role: "author", isAdministrator: false, isDeactivated: false },
      { email: "reader@iqb.test", role: "reader", isAdministrator: false, isDeactivated: false },
      { email: "reviewer@iqb.test", role: "reviewer", isAdministrator: true, isDeactivated: false },
    ]);
  });

  it("still lists a Deactivated Viewer and one who has not set a password yet", async () => {
    await api.database.viewer.update({
      where: { email: "author@iqb.test" },
      data: { isDeactivated: true },
    });
    await api.database.viewer.create({ data: { email: "new@iqb.test", role: "reader" } });
    const token = await logIn(api, seededViewer("reviewer"));

    const { viewers } = viewerListResponseSchema.parse(await (await getViewers(api, token)).json());

    expect(viewers.find(({ email }) => email === "author@iqb.test")?.isDeactivated).toBe(true);
    expect(viewers.map(({ email }) => email)).toContain("new@iqb.test");
  });

  it.each(["reader", "author"] as const)(
    "refuses a %s without the Administrator authority",
    async (role) => {
      const token = await logIn(api, seededViewer(role));

      const response = await getViewers(api, token);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    },
  );
});
