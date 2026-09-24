import { changeRoleRequestSchema, type ViewerResponse } from "@iqb/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireAdministrator } from "../auth/require-administrator.middleware.ts";
import { appointAdministrator, changeRole, withdrawAdministrator } from "./administration.service.ts";
import type { Database } from "../../platform/database.ts";
import { InvalidRequestError } from "../../platform/errors.ts";

const viewerIdSchema = z.uuid();

/** No Question is named here, so a malformed id is simply a bad request rather than the
 * missing-Question disguise `requireRole`'s callers need (ADR-0002). */
function viewerIdNamed(req: Request): string {
  const id = viewerIdSchema.safeParse(req.params["id"]);
  if (!id.success) throw new InvalidRequestError("Not a valid Viewer id.");
  return id.data;
}

/**
 * Every route here is Administrator-only (ADR-0015): the check sits on the router, not
 * on each route, because nothing under it needs a Question looked up first.
 */
export function administrationRoutes(database: Database): Router {
  const router = Router();
  router.use(requireAdministrator());

  router.post("/:id/administrator", async (req, res) => {
    const id = viewerIdNamed(req);

    const viewer = await appointAdministrator(database, authenticatedViewer(req), id);

    const body: ViewerResponse = { viewer };
    res.json(body);
  });

  // The last-Administrator invariant is enforced inside, not here (ADR-0015).
  router.delete("/:id/administrator", async (req, res) => {
    const id = viewerIdNamed(req);

    const viewer = await withdrawAdministrator(database, authenticatedViewer(req), id);

    const body: ViewerResponse = { viewer };
    res.json(body);
  });

  router.patch("/:id/role", async (req, res) => {
    const id = viewerIdNamed(req);
    const request = changeRoleRequestSchema.parse(req.body);

    const viewer = await changeRole(database, authenticatedViewer(req), id, request.role);

    const body: ViewerResponse = { viewer };
    res.json(body);
  });

  return router;
}
