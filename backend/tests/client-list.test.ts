import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { clientNamesListed, postClient } from "./helpers/clients.ts";
import { seedTheBank } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

describe("listing Clients", () => {
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

  // A Client hides nothing (ADR-0050), so what a Viewer holds changes nothing here.
  it.each(["reader", "author", "reviewer"] as const)(
    "shows the seeded %s every Client, in name order",
    async (role) => {
      const token = await logIn(api, seededViewer(role));

      expect(await clientNamesListed(api, token)).toEqual([seedOtherClient.name, seedClient.name]);
    },
  );

  it("lists a Client an Administrator just created, to every Viewer", async () => {
    const administratorToken = await logIn(api, seededViewer("reviewer"));
    const created = await postClient(api, { name: "Harbour Logistics" }, administratorToken);
    expect(created.status).toBe(201);
    const readerToken = await logIn(api, seededViewer("reader"));

    expect(await clientNamesListed(api, readerToken)).toEqual([
      "Harbour Logistics",
      seedOtherClient.name,
      seedClient.name,
    ]);
  });
});
