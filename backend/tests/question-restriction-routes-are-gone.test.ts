import { apiErrorSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { clientIdNamed, seedTheBank, seededQuestionIds } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** A Question's Clients change by edit now (ADR-0050), so the old acts answer as any route
 * that does not exist. */
describe("the old restrict and remove-restriction routes", () => {
  let api: TestApi;
  let reviewerToken: string;
  let clientId: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    clientId = await clientIdNamed(api.database, seedClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  it.each(["restrict", "remove-restriction"])("answer %s as unknown", async (act) => {
    const response = await api.request(
      `/api/questions/${seededQuestionIds.aboutTypeScript}/${act}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${reviewerToken}` },
        body: JSON.stringify({ clientId }),
      },
    );

    expect(response.status).toBe(404);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("not_found");
  });
});
