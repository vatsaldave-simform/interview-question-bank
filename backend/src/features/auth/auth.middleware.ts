import type { RequestHandler } from "express";
import type { Database } from "../../platform/database.js";
import { UnauthenticatedError } from "../../platform/errors.js";
import { log } from "../../platform/logger.js";
import { verifyAccessToken, type AccessTokenConfig, type RefusalReason } from "./access-token.js";
import { findViewerById } from "../viewers/viewers.repository.js";

const bearer = /^Bearer (?<token>\S+)$/;

/**
 * One refusal, whatever went wrong. The reason is logged rather than answered: an
 * operator can tell an expired token from a forged one, and a caller cannot.
 */
function refusal(reason: RefusalReason | "absent" | "unknown_viewer"): UnauthenticatedError {
  log().debug({ reason }, "authentication refused");
  return new UnauthenticatedError();
}

function presentedToken(header: string | undefined): string | undefined {
  return header === undefined ? undefined : bearer.exec(header)?.groups?.["token"];
}

/**
 * What anything behind the gate needs: the Viewers to resolve a token against, and the
 * configuration the token was signed with. One type, because all three of the gate, the
 * auth routes and the /api router want exactly this pair.
 */
export type AuthDependencies = {
  database: Database;
  accessToken: AccessTokenConfig;
};

/**
 * The gate. Past it, every request acts as exactly one Viewer; short of it, no request
 * gets through at all — there is no anonymous path.
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

    req.viewer = viewer;
    next();
  };
}
