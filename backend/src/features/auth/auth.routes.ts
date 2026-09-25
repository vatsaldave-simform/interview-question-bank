import {
  loginRequestSchema,
  passwordResetRequestSchema,
  setPasswordRequestSchema,
  type CurrentViewerResponse,
  type LoginResponse,
  type RefreshResponse,
  type Viewer,
} from "@iqb/shared";
import { Router, type Response } from "express";
import { signAccessToken } from "./access-token.ts";
import { authenticatedViewer } from "./authenticated-viewer.ts";
import type { AuthDependencies } from "./auth.middleware.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import {
  mailPasswordResetLink,
  type PasswordResetMailDependencies,
} from "./password-reset.service.ts";
import { spendPasswordToken } from "./password-token.ts";
import {
  clearRefreshCookie,
  presentedRefreshToken,
  setRefreshCookie,
  type RefreshCookieConfig,
} from "./refresh-cookie.ts";
import { revokeRefreshTokensOfViewer } from "./refresh-token.repository.ts";
import {
  issueRefreshToken,
  revokeRefreshTokenFamilyOf,
  rotateRefreshToken,
  type RefreshTokenConfig,
} from "./refresh-token.ts";
import {
  findViewerByEmail,
  findViewerById,
  setPasswordHash,
} from "../viewers/viewers.repository.ts";
import { UnauthenticatedError } from "../../platform/errors.ts";
import {
  limitRequests,
  type RateLimitConfig,
} from "../../platform/http/rate-limit.middleware.ts";
import { log } from "../../platform/logger.ts";

/** The public routes also need to know how hard a caller may knock (ADR-0021). */
export type PublicAuthDependencies = AuthDependencies & {
  authRateLimit: RateLimitConfig;
  refreshToken: RefreshTokenConfig;
  refreshCookie: RefreshCookieConfig;
  passwordResetMail: PasswordResetMailDependencies;
};

/** The credentials were wrong. Which half was wrong is never said, nor logged. */
const badCredentials = () => new UnauthenticatedError("Those credentials are not valid.");

/** A 401, because the token is the credential here, which also keeps a dead link apart
 * from a 400 about the password. */
const deadLink = () =>
  new UnauthenticatedError("This link is not valid. It may have expired or been used already.");

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
 * Mounted ahead of the sign-in check for that reason alone.
 */
export function publicAuthRoutes({
  database,
  accessToken,
  authRateLimit,
  refreshToken,
  refreshCookie,
  passwordResetMail,
}: PublicAuthDependencies): Router {
  const router = Router();

  // On each route and not on the router: a request for a path behind the sign-in check
  // below passes through here first, and would otherwise spend the allowance on its way
  // to being refused.
  router.post("/login", limitRequests(authRateLimit), async (req, res) => {
    const credentials = loginRequestSchema.parse(req.body);

    const viewer = await findViewerByEmail(database, credentials.email);
    // A Viewer with no password yet, or a Deactivated one, is refused like an address with
    // no account, so login does not tell a caller which accounts are waiting or Deactivated.
    if (!viewer || viewer.passwordHash === null || viewer.isDeactivated) {
      // Hash the presented password and throw the result away. Hashing costs what
      // verifying costs, so an address with no account takes as long to refuse as a
      // wrong password does; without this the response time alone would tell a caller
      // which addresses have accounts, which is the thing ADR-0016 refuses to hand out
      // on the reset page.
      await hashPassword(credentials.password);
      throw badCredentials();
    }
    if (!(await verifyPassword(credentials.password, viewer.passwordHash))) {
      throw badCredentials();
    }

    const body: LoginResponse = {
      accessToken: await signAccessToken(viewer.id, accessToken),
      expiresInSeconds: accessToken.lifetimeSeconds,
      viewer: {
        id: viewer.id,
        email: viewer.email,
        role: viewer.role,
        isAdministrator: viewer.isAdministrator,
        isDeactivated: viewer.isDeactivated,
      } satisfies Viewer,
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
    // A login that began just before a Deactivation can issue its token just after it,
    // so the revoking done at Deactivation misses that token.
    if (!viewer || viewer.isDeactivated) refuseSession(res, refreshCookie);

    setRefreshCookie(res, rotation.refreshToken, refreshCookie);
    const body: RefreshResponse = {
      accessToken: await signAccessToken(viewer.id, accessToken),
      expiresInSeconds: accessToken.lifetimeSeconds,
      viewer,
    };
    res.json(body);
  });

  // The body is checked before the token is looked at, so a password that is refused
  // does not use the link up.
  router.post("/set-password", limitRequests(authRateLimit), async (req, res) => {
    const request = setPasswordRequestSchema.parse(req.body);

    // Before the transaction, so a slow hash never holds it open.
    const passwordHash = await hashPassword(request.password);
    const viewerId = await database.$transaction(async (transaction) => {
      const spentFor = await spendPasswordToken(transaction, request.token);
      if (spentFor === null) return null;
      await setPasswordHash(transaction, spentFor, passwordHash);
      // Whoever reset a password because someone else got in must not leave that
      // someone signed in.
      await revokeRefreshTokensOfViewer(transaction, spentFor);
      return spentFor;
    });
    if (viewerId === null) throw deadLink();

    log().info({ viewerId }, "password set");
    res.status(204).end();
  });

  // Answers before it looks the address up, so neither the answer nor the time it takes
  // says whether the address has an account (ADR-0038).
  router.post("/password-reset", limitRequests(authRateLimit), (req, res) => {
    const { email } = passwordResetRequestSchema.parse(req.body);

    res.status(202).end();
    void mailPasswordResetLink(database, passwordResetMail, email);
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

/** Mounted behind the sign-in check: it answers for whoever the presented token names. */
export function authenticatedAuthRoutes(): Router {
  const router = Router();

  // What the client asks after a reload, once it has recovered an access token.
  router.get("/me", (req, res) => {
    const body: CurrentViewerResponse = { viewer: authenticatedViewer(req) };
    res.json(body);
  });

  return router;
}
