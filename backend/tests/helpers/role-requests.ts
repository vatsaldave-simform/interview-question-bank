import { roleRequestListResponseSchema, type RoleRequest } from "@iqb/shared";
import type { TestApi } from "./test-api.ts";

export function postRoleRequest(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/role-requests", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function getMyRoleRequests(api: TestApi, token: string): Promise<Response> {
  return api.request("/api/role-requests/mine", {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** The caller's own Role Requests, for a test whose subject is what they can read back. */
export async function myRoleRequests(api: TestApi, token: string): Promise<RoleRequest[]> {
  const response = await getMyRoleRequests(api, token);
  if (response.status !== 200) {
    throw new Error(`Listing my Role Requests failed with ${response.status}.`);
  }
  return roleRequestListResponseSchema.parse(await response.json()).roleRequests;
}
