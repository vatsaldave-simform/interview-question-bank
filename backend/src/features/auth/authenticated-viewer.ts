import type { Viewer } from "@iqb/shared";
import type { Request } from "express";
import { UnauthenticatedError } from "../../platform/errors.js";

// Augments Express's Request globally: importing this file anywhere is what makes
// `req.viewer` exist everywhere.
declare global {
  namespace Express {
    interface Request {
      /** Attached by the sign-in check. Read it through `authenticatedViewer`. */
      viewer?: Viewer;
    }
  }
}

/**
 * The authenticated Viewer for this request. Raises rather than returning undefined,
 * so a handler that ends up outside the sign-in check by mistake refuses the request
 * instead of quietly acting for nobody.
 */
export function authenticatedViewer(req: Request): Viewer {
  if (!req.viewer) throw new UnauthenticatedError();
  return req.viewer;
}
