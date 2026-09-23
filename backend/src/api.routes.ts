import { Router } from "express";
import { requireAuthenticatedViewer } from "./features/auth/auth.middleware.ts";
import { notFoundHandler } from "./platform/http/error-handler.middleware.ts";
import {
  authenticatedAuthRoutes,
  publicAuthRoutes,
  type PublicAuthDependencies,
} from "./features/auth/auth.routes.ts";
import { categoryRoutes } from "./features/categories/categories.routes.ts";
import { questionRoutes } from "./features/questions/questions.routes.ts";

/**
 * Every application route mounts here, under /api (ADR-0012). The health and readiness
 * routes deliberately do not, because they are the contract with the platform rather
 * than part of the application, and the platform holds no credentials.
 *
 * The order is the design. Starting, recovering and ending a session come first,
 * because they are how a token is obtained and given up. The sign-in check comes next.
 * Everything after it — the Questions router, later tickets' routers, and the not-found
 * handler that ends this one — can only be reached by a signed-in Viewer. A route added
 * below the check is protected by where it sits, not by anyone remembering to protect it.
 *
 * The not-found handler sitting below the check is deliberate too: a caller who is not
 * signed in is told 401 for every /api path alike, so nobody can map out the API by
 * probing for which paths answer 404.
 */
export function apiRoutes(dependencies: PublicAuthDependencies): Router {
  const { database, accessToken } = dependencies;
  const router = Router();

  router.use("/auth", publicAuthRoutes(dependencies));

  router.use(requireAuthenticatedViewer({ database, accessToken }));

  router.use("/auth", authenticatedAuthRoutes());
  router.use("/questions", questionRoutes(database));
  router.use("/categories", categoryRoutes(database));
  router.use(notFoundHandler);
  return router;
}
