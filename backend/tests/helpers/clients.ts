import { clientListResponseSchema } from "@iqb/shared";
import type { TestApi } from "./test-api.ts";

/** A uuid that is well formed and names no Client and no Viewer. */
export const unknownId = "c0000000-0000-4000-8000-00000000ffff";

/** The names in a Viewer's own Client list, for a test whose subject is what it holds. */
export async function clientNamesListed(api: TestApi, token: string): Promise<string[]> {
  const response = await api.request("/api/clients", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status !== 200) throw new Error(`Listing Clients failed with ${response.status}.`);
  return clientListResponseSchema.parse(await response.json()).clients.map(({ name }) => name);
}

export function postClient(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function postGrant(
  api: TestApi,
  clientId: string,
  body: unknown,
  token: string,
): Promise<Response> {
  return api.request(`/api/clients/${clientId}/grants`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function getGrants(api: TestApi, clientId: string, token: string): Promise<Response> {
  return api.request(`/api/clients/${clientId}/grants`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

export function deleteGrant(
  api: TestApi,
  clientId: string,
  viewerId: string,
  token: string,
): Promise<Response> {
  return api.request(`/api/clients/${clientId}/grants/${viewerId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
}
