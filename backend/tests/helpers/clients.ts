import type { TestApi } from "./test-api.ts";

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
