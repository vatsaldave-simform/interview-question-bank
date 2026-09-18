import { Router } from "express";
import { requireAuthenticatedViewer } from "./features/auth/auth.middleware.js";
import { notFoundHandler } from "./platform/http/error-handler.middleware.js";
import {
  authenticatedAuthRoutes,
  publicAuthRoutes,
  type PublicAuthDependencies,
} from "./features/auth/auth.routes.js";
import { questionRoutes } from "./features/questions/questions.routes.js";

/**
 * Every application route mounts here, under /api (ADR-0012). The health and readiness
 * routes deliberately do not, because they are the contract with the platform rather
 * than part of the application, and the platform holds no credentials.
 *
 * The order is the design. Starting, recovering and ending a session come first,
 * because they are how a token is obtained and given up; the authentication gate comes
 * next; everything after it — the Questions router, later tickets' routers, and the
 * not-found handler that ends this one — is reachable only by an authenticated Viewer. A route added below the gate is protected by having been added
 * there, rather than by remembering to protect it.
 *
 * The not-found handler sitting behind the gate is deliberate too: an anonymous caller
 * is told 401 for every /api path alike, so the shape of the API cannot be mapped by
 * probing for which paths answer 404.
 */
export function apiRoutes(dependencies: PublicAuthDependencies): Router {
  const { database, accessToken } = dependencies;
  const router = Router();

  router.use("/auth", publicAuthRoutes(dependencies));

  router.use(requireAuthenticatedViewer({ database, accessToken }));

  router.use("/auth", authenticatedAuthRoutes());
  router.use("/questions", questionRoutes(database));
  router.use(notFoundHandler);
  return router;
}
