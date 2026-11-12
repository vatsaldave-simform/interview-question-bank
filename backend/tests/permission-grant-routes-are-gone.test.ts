import { apiErrorSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { clientIdNamed, seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** A Grant authorises nothing once a Client hides nothing, so its routes and the
 * Administrator's own list of Clients answer as any route that does not exist (ADR-0051). */
describe("the old Permission Grant routes and the Administrator's Client list", () => {
  let api: TestApi;
  let administratorToken: string;
  let grantsPath: string;
  let viewerId: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    administratorToken = await logIn(api, seededViewer("reviewer"));
    grantsPath = `/api/clients/${await clientIdNamed(api.database, seedClient.name)}/grants`;
    viewerId = (await viewerByRole(api.database, "author")).id;
  });
  afterAll(async () => {
    await api.stop();
  });

  it.each([
    ["listing Grants", "GET", (): string => grantsPath],
    ["issuing a Grant", "POST", (): string => grantsPath],
    ["revoking a Grant", "DELETE", (): string => `${grantsPath}/${viewerId}`],
    ["listing every Client as an Administrator", "GET", (): string => "/api/clients/all"],
  ] as const)("answers %s as unknown", async (_, method, path) => {
    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${administratorToken}`,
    };
    const response = await api.request(path(), {
      method,
      headers,
      ...(method === "POST" && { body: JSON.stringify({ viewerId: viewerId }) }),
    });

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });
});
