import type { RequestHandler } from "express";
import { ForbiddenError } from "../../platform/errors.ts";
import { authenticatedViewer } from "./authenticated-viewer.ts";

/**
 * Every administrative route names a Viewer rather than a Question, so there is no
 * visibility check to run first and no leak in refusing here (unlike `requireRole`,
 * ADR-0002).
 */
export function requireAdministrator(): RequestHandler {
  return (req, _res, next) => {
    if (!authenticatedViewer(req).isAdministrator) throw new ForbiddenError();
    next();
  };
}
