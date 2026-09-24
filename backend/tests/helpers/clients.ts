import type { TestApi } from "./test-api.ts";

export function postClient(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
