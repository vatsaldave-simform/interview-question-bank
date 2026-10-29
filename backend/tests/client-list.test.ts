import { apiErrorSchema, clientListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { clientNamesListed, getEveryClient, postClient } from "./helpers/clients.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
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

  it("shows a Viewer holding no Permission Grant at all every Client too", async () => {
    const reader = await viewerByRole(api.database, "reader");
    await api.database.permissionGrant.deleteMany({ where: { viewerId: reader.id } });
    const readerToken = await logIn(api, seededViewer("reader"));

    expect(await clientNamesListed(api, readerToken)).toEqual([
      seedOtherClient.name,
      seedClient.name,
    ]);
  });

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

describe("listing every Client", () => {
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

  it("shows an Administrator every Client in name order, Granted or not", async () => {
    const administratorToken = await logIn(api, seededViewer("reviewer"));
    const created = await postClient(api, { name: "Harbour Logistics" }, administratorToken);
    expect(created.status).toBe(201);

    const response = await getEveryClient(api, administratorToken);

    expect(response.status).toBe(200);
    const { clients } = clientListResponseSchema.parse(await response.json());
    expect(clients.map(({ name }) => name)).toEqual([
      "Harbour Logistics",
      seedOtherClient.name,
      seedClient.name,
    ]);
  });

  it.each(["reader", "author"] as const)(
    "refuses the seeded %s, who is not an Administrator",
    async (role) => {
      const token = await logIn(api, seededViewer(role));

      const response = await getEveryClient(api, token);

      expect(response.status).toBe(403);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    },
  );
});
