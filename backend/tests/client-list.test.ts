import { clientListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

async function clientNamesListed(api: TestApi, token: string): Promise<string[]> {
  const response = await api.request("/api/clients", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return clientListResponseSchema.parse(await response.json()).clients.map(({ name }) => name);
}

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
    // Removed directly, because revoking a Grant has no endpoint yet (#24).
    const reader = await viewerByRole(api.database, "reader");
    await api.database.permissionGrant.deleteMany({ where: { viewerId: reader.id } });
    const readerToken = await logIn(api, seededViewer("reader"));

    expect(await clientNamesListed(api, readerToken)).toEqual([]);
  });

  it("shows a Viewer holding two Permission Grants both Clients, by name", async () => {
    const author = await viewerByRole(api.database, "author");
    const other = await api.database.client.findUniqueOrThrow({
      where: { name: seedOtherClient.name },
    });
    await api.database.permissionGrant.create({
      data: { viewerId: author.id, clientId: other.id },
    });
    const authorToken = await logIn(api, seededViewer("author"));

    expect(await clientNamesListed(api, authorToken)).toEqual([
      seedOtherClient.name,
      seedClient.name,
    ]);
  });

  it("leaves out a Client an Administrator just created but holds no Grant for", async () => {
    const administratorToken = await logIn(api, seededViewer("reviewer"));
    const created = await api.request("/api/clients", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${administratorToken}`,
      },
      body: JSON.stringify({ name: "Harbour Logistics" }),
    });
    expect(created.status).toBe(201);

    expect(await clientNamesListed(api, administratorToken)).toEqual([seedOtherClient.name]);
  });
});
