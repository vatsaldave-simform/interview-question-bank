import { apiErrorSchema, clientListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  clientNamesListed,
  deleteGrant,
  getEveryClient,
  postClient,
} from "./helpers/clients.ts";
import { clientIdNamed, seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
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

  it("shows a Viewer holding one Permission Grant exactly that one Client", async () => {
    const readerToken = await logIn(api, seededViewer("reader"));

    expect(await clientNamesListed(api, readerToken)).toEqual([seedClient.name]);
  });

  it("shows a Viewer holding no Permission Grant an empty list", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const clientId = await clientIdNamed(api.database, seedClient.name);
    const administratorToken = await logIn(api, seededViewer("reviewer"));
    const revoked = await deleteGrant(api, clientId, reader.id, administratorToken);
    expect(revoked.status).toBe(204);
    const readerToken = await logIn(api, seededViewer("reader"));

    expect(await clientNamesListed(api, readerToken)).toEqual([]);
  });

  it("shows a Viewer holding two Permission Grants both Clients, in name order", async () => {
    const author = await viewerByRole(api.database, "author");
    const otherClientId = await clientIdNamed(api.database, seedOtherClient.name);
    await api.database.permissionGrant.create({
      data: { viewerId: author.id, clientId: otherClientId },
    });
    const authorToken = await logIn(api, seededViewer("author"));

    expect(await clientNamesListed(api, authorToken)).toEqual([
      seedOtherClient.name,
      seedClient.name,
    ]);
  });

  it("leaves out a Client an Administrator just created but holds no Grant for", async () => {
    const administratorToken = await logIn(api, seededViewer("reviewer"));
    const created = await postClient(api, { name: "Harbour Logistics" }, administratorToken);
    expect(created.status).toBe(201);

    expect(await clientNamesListed(api, administratorToken)).toEqual([seedOtherClient.name]);
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

  it("leaves the Administrator's own Client list scoped by Permission Grant", async () => {
    const administratorToken = await logIn(api, seededViewer("reviewer"));

    await getEveryClient(api, administratorToken);

    expect(await clientNamesListed(api, administratorToken)).toEqual([seedOtherClient.name]);
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
