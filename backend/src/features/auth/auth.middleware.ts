import type { RequestHandler } from "express";
import type { Database } from "../../platform/database.ts";
import { UnauthenticatedError } from "../../platform/errors.ts";
import { log } from "../../platform/logger.ts";
import { verifyAccessToken, type AccessTokenConfig, type RefusalReason } from "./access-token.ts";
import { findViewerById } from "../viewers/viewers.repository.ts";

const bearer = /^Bearer (?<token>\S+)$/;

/**
 * One refusal, whatever went wrong. The reason is logged rather than answered: an
 * operator can tell an expired token from a forged one, and a caller cannot.
 */
function refusal(
  reason: RefusalReason | "absent" | "unknown_viewer" | "deactivated_viewer",
): UnauthenticatedError {
  log().debug({ reason }, "authentication refused");
  return new UnauthenticatedError();
}

function presentedToken(header: string | undefined): string | undefined {
  return header === undefined ? undefined : bearer.exec(header)?.groups?.["token"];
}

/**
 * What the sign-in check needs: the Viewers to look a token up against, and the settings
 * the token was signed with. One type, because the check, the auth routes and the /api
 * router all want exactly this pair.
 */
export type AuthDependencies = {
  database: Database;
  accessToken: AccessTokenConfig;
};

/**
 * The sign-in check. Past it, every request acts as exactly one Viewer. Short of it, no
 * request gets through at all — there is no way in without signing in.
 */
export function requireAuthenticatedViewer({
  database,
  accessToken,
}: AuthDependencies): RequestHandler {
  // Express 5 forwards a rejected handler promise to the error middleware, so a
  // refusal raised in here lands on the same path as any other error.
  return async (req, _res, next) => {
    const token = presentedToken(req.headers.authorization);
    if (token === undefined) throw refusal("absent");

    const verified = await verifyAccessToken(token, accessToken);
    if (!verified.valid) throw refusal(verified.reason);

    const viewer = await findViewerById(database, verified.claims.viewerId);
    if (!viewer) throw refusal("unknown_viewer");
    // Here and not only at login, so a Deactivation ends an open session on its next
    // request rather than when its access token expires (ADR-0017).
    if (viewer.isDeactivated) throw refusal("deactivated_viewer");

    req.viewer = viewer;
    next();
  };
}
