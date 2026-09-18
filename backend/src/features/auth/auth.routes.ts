import {
  loginRequestSchema,
  type CurrentViewerResponse,
  type LoginResponse,
  type RefreshResponse,
  type Viewer,
} from "@iqb/shared";
import { Router, type Response } from "express";
import { signAccessToken } from "./access-token.js";
import { authenticatedViewer } from "./authenticated-viewer.js";
import type { AuthDependencies } from "./auth.middleware.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  clearRefreshCookie,
  presentedRefreshToken,
  setRefreshCookie,
  type RefreshCookieConfig,
} from "./refresh-cookie.js";
import {
  issueRefreshToken,
  revokeRefreshTokenFamilyOf,
  rotateRefreshToken,
  type RefreshTokenConfig,
} from "./refresh-token.js";
import { findViewerByEmail, findViewerById } from "../viewers/viewers.repository.js";
import { UnauthenticatedError } from "../../platform/errors.js";
import {
  limitRequests,
  type RateLimitConfig,
} from "../../platform/http/rate-limit.middleware.js";
import { log } from "../../platform/logger.js";

/** The public routes also need to know how hard a caller may knock (ADR-0021). */
export type PublicAuthDependencies = AuthDependencies & {
  authRateLimit: RateLimitConfig;
  refreshToken: RefreshTokenConfig;
  refreshCookie: RefreshCookieConfig;
};

/** The credentials were wrong. Which half was wrong is never said, nor logged. */
const badCredentials = () => new UnauthenticatedError("Those credentials are not valid.");

/** A refusal a caller cannot learn anything from: there is no session, whichever way. */
const noSession = () => new UnauthenticatedError("There is no session to refresh.");

/**
 * The cookie is cleared on every refusal, reuse included: the token it holds is dead
 * either way, and leaving it would have the client present it again.
 */
function refuseSession(res: Response, cookie: RefreshCookieConfig): never {
  clearRefreshCookie(res, cookie);
  throw noSession();
}

/**
 * The routes reachable without an access token, because they are how one is obtained.
 * Mounted ahead of the authentication gate for that reason alone.
 */
export function publicAuthRoutes({
  database,
  accessToken,
  authRateLimit,
  refreshToken,
  refreshCookie,
}: PublicAuthDependencies): Router {
  const router = Router();

  // On each route and not on the router: a request for a path the gate below owns
  // passes through here first, and would otherwise spend the allowance on its way to
  // being refused.
  router.post("/login", limitRequests(authRateLimit), async (req, res) => {
    const credentials = loginRequestSchema.parse(req.body);

    const viewer = await findViewerByEmail(database, credentials.email);
    if (!viewer) {
      // Hash the presented password and throw the result away. Hashing costs what
      // verifying costs, so an address with no account takes as long to refuse as a
      // wrong password does; without this the response time alone is an account
      // oracle, which is the thing ADR-0016 refuses to hand out on the reset page.
      await hashPassword(credentials.password);
      throw badCredentials();
    }
    if (!(await verifyPassword(credentials.password, viewer.passwordHash))) {
      throw badCredentials();
    }

    const body: LoginResponse = {
      accessToken: await signAccessToken(viewer.id, accessToken),
      expiresInSeconds: accessToken.lifetimeSeconds,
      viewer: { id: viewer.id, email: viewer.email, role: viewer.role } satisfies Viewer,
    };
    // Last, so that a response that never gets built leaves no cookie and no row.
    setRefreshCookie(res, await issueRefreshToken(database, viewer.id, refreshToken), refreshCookie);
    log().info({ viewerId: viewer.id, role: viewer.role }, "viewer signed in");
    res.json(body);
  });

  // What the client asks on load to recover an access token it never stored (ADR-0008).
  router.post("/refresh", limitRequests(authRateLimit), async (req, res) => {
    const presented = presentedRefreshToken(req);
    if (presented === undefined) throw noSession();

    const rotation = await rotateRefreshToken(database, presented, refreshToken);
    if (!rotation.rotated) {
      log().debug({ reason: rotation.reason }, "refresh refused");
      refuseSession(res, refreshCookie);
    }

    // Read rather than trusted from the rotation, so a Viewer changed since they last
    // refreshed takes effect now instead of when their family happens to end.
    const viewer = await findViewerById(database, rotation.viewerId);
    if (!viewer) refuseSession(res, refreshCookie);

    setRefreshCookie(res, rotation.refreshToken, refreshCookie);
    const body: RefreshResponse = {
      accessToken: await signAccessToken(viewer.id, accessToken),
      expiresInSeconds: accessToken.lifetimeSeconds,
      viewer,
    };
    res.json(body);
  });

  // Answers the same whatever it was given, so it is safe to call twice and says
  // nothing about whether the token it was handed meant anything.
  router.post("/logout", limitRequests(authRateLimit), async (req, res) => {
    const presented = presentedRefreshToken(req);
    if (presented !== undefined) await revokeRefreshTokenFamilyOf(database, presented);

    clearRefreshCookie(res, refreshCookie);
    res.status(204).end();
  });

  return router;
}

/** Mounted behind the gate: it answers for whoever the presented token authenticates. */
export function authenticatedAuthRoutes(): Router {
  const router = Router();

  // What the client asks after a reload, once it has recovered an access token.
  router.get("/me", (req, res) => {
    const body: CurrentViewerResponse = { viewer: authenticatedViewer(req) };
    res.json(body);
  });

  return router;
}
