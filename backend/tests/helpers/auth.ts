import { loginResponseSchema, type ViewerRole } from "@iqb/shared";
import { hashPassword } from "../../src/features/auth/password.ts";
import { type SeedViewer } from "../../src/features/viewers/viewers.seed.ts";
import type { TestApi } from "./test-api.ts";

/** Long enough to satisfy the environment schema, and obviously not a real secret. */
export const testAccessTokenSecret = "test-access-token-secret-do-not-deploy";

/** The seeded Viewer holding a role, for a test that needs one of a particular kind. */
export { seedViewerByRole as seededViewer } from "../../src/features/viewers/viewers.seed.ts";

/** The login request itself, for a test that wants to read the response it got. */
export function postLogin(
  api: TestApi,
  credentials: { email: string; password: string },
  headers: Record<string, string> = {},
) {
  return api.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(credentials),
  });
}

/** Signs in over HTTP and hands back the access token, the way a client gets one. */
export async function logIn(api: TestApi, viewer: SeedViewer): Promise<string> {
  // Only the two fields, because the request schema is strict and a SeedViewer
  // carries a role as well.
  const response = await postLogin(api, { email: viewer.email, password: viewer.password });
  if (response.status !== 200) {
    throw new Error(`Logging in as ${viewer.email} failed with ${response.status}.`);
  }
  return loginResponseSchema.parse(await response.json()).accessToken;
}

/** Every seeded Viewer holds a Permission Grant, so a Viewer holding none is written
 * straight to the database rather than created over HTTP by an Administrator. */
export async function logInHoldingNoGrant(api: TestApi, role: ViewerRole): Promise<string> {
  const credentials = {
    email: `no-grant-${role}-${crypto.randomUUID()}@iqb.test`,
    password: `no-grant-${role}-password`,
    role,
  };
  await api.database.viewer.create({
    data: {
      email: credentials.email,
      role,
      passwordHash: await hashPassword(credentials.password),
    },
  });
  return logIn(api, credentials);
}
