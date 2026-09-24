import { apiErrorSchema, clientResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function createClient(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function clientCreatedEvents(api: TestApi) {
  return api.database.changeEvent.findMany({ where: { type: "client_created" } });
}

describe("creating a Client", () => {
  let api: TestApi;
  let administratorToken: string;
  let authorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
  });
  beforeEach(async () => {
    await seedTheBank(api.database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    administratorToken = await logIn(api, seededViewer("reviewer"));
    authorToken = await logIn(api, seededViewer("author"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("creates a Client and answers with it", async () => {
    const response = await createClient(api, { name: "Harbour Logistics" }, administratorToken);

    expect(response.status).toBe(201);
    const { client } = clientResponseSchema.parse(await response.json());
    expect(client.name).toBe("Harbour Logistics");
    const stored = await api.database.client.findUnique({ where: { id: client.id } });
    expect(stored?.name).toBe("Harbour Logistics");
  });

  it("records the creation under the acting Administrator's name", async () => {
    const response = await createClient(api, { name: "Harbour Logistics" }, administratorToken);
    const { client } = clientResponseSchema.parse(await response.json());

    const events = await clientCreatedEvents(api);
    expect(events).toHaveLength(1);
    expect(events[0]?.questionId).toBeNull();
    expect(events[0]?.viewerId).toBe((await viewerByRole(api.database, "reviewer")).id);
    expect(events[0]?.payload).toEqual({ client: { id: client.id, name: "Harbour Logistics" } });
  });

  it("gives the creator no Permission Grant for it", async () => {
    const response = await createClient(api, { name: "Harbour Logistics" }, administratorToken);
    const { client } = clientResponseSchema.parse(await response.json());

    const grants = await api.database.permissionGrant.count({ where: { clientId: client.id } });
    expect(grants).toBe(0);
  });

  it("trims the name before storing it", async () => {
    const response = await createClient(api, { name: "  Harbour Logistics  " }, administratorToken);

    const { client } = clientResponseSchema.parse(await response.json());
    expect(client.name).toBe("Harbour Logistics");
  });

  it("refuses a Viewer who is not an Administrator, and creates nothing", async () => {
    const response = await createClient(api, { name: "Harbour Logistics" }, authorToken);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
    expect(await api.database.client.count({ where: { name: "Harbour Logistics" } })).toBe(0);
    expect(await clientCreatedEvents(api)).toHaveLength(0);
  });

  it("refuses a name another Client already has, and records nothing", async () => {
    const response = await createClient(api, { name: seedClient.name }, administratorToken);

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("conflict");
    expect(await clientCreatedEvents(api)).toHaveLength(0);
  });

  it.each([
    ["no name", {}],
    ["a blank name", { name: "   " }],
    ["a name over 200 characters", { name: "x".repeat(201) }],
    ["a field it does not know", { name: "Harbour Logistics", colour: "blue" }],
  ])("refuses %s", async (_, body) => {
    const response = await createClient(api, body, administratorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("has no way to delete a Client", async () => {
    const client = await api.database.client.findUniqueOrThrow({ where: { name: seedClient.name } });

    const response = await api.request(`/api/clients/${client.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${administratorToken}` },
    });

    expect(response.status).toBe(404);
    expect(await api.database.client.count({ where: { id: client.id } })).toBe(1);
  });
});
