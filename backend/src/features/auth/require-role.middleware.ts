import type { ViewerRole } from "@iqb/shared";
import type { RequestHandler } from "express";
import { ForbiddenError } from "../../platform/errors.js";
import { authenticatedViewer } from "./authenticated-viewer.js";

/**
 * Safe on a route that names no Question, which is the only place it is used: a role
 * refusal on a route that named one would say the Question exists, so such a route has
 * to look it up through the visibility check first (ADR-0002).
 */
export function requireRole(...roles: readonly ViewerRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(authenticatedViewer(req).role)) throw new ForbiddenError();
    next();
  };
}
