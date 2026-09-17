import { Router } from "express";
import { notFoundHandler } from "../http/error-handler.js";

/**
 * Every application route mounts here, under /api (ADR-0012). Later tickets add to
 * this router; the health and readiness routes deliberately do not, because they are
 * the contract with the platform rather than part of the application.
 *
 * The router ends in the not-found handler, so an unknown /api path is refused with
 * the error contract instead of falling through to the client's fallback and coming
 * back as HTML with a 200.
 */
export function apiRoutes(): Router {
  const router = Router();
  router.use(notFoundHandler);
  return router;
}
