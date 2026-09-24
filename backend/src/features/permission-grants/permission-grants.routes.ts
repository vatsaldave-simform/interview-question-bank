import {
  issuePermissionGrantRequestSchema,
  type PermissionGrantListResponse,
  type PermissionGrantResponse,
} from "@iqb/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireAdministrator } from "../auth/require-administrator.middleware.ts";
import {
  issuePermissionGrant,
  listPermissionGrants,
  revokePermissionGrant,
} from "./permission-grants.service.ts";
import type { Database } from "../../platform/database.ts";
import { InvalidRequestError } from "../../platform/errors.ts";

const idSchema = z.uuid();

function clientIdNamed(req: Request): string {
  const id = idSchema.safeParse(req.params["clientId"]);
  if (!id.success) throw new InvalidRequestError("Not a valid Client id.");
  return id.data;
}

function viewerIdNamed(req: Request): string {
  const id = idSchema.safeParse(req.params["viewerId"]);
  if (!id.success) throw new InvalidRequestError("Not a valid Viewer id.");
  return id.data;
}

export function permissionGrantRoutes(database: Database): Router {
  // The Client's id is in the path this router is mounted under, not in its own.
  const router = Router({ mergeParams: true });
  // The check sits on the router, because every route here is Administrator-only.
  router.use(requireAdministrator());

  router.get("/", async (req, res) => {
    const grants = await listPermissionGrants(database, clientIdNamed(req));

    const body: PermissionGrantListResponse = { grants };
    res.json(body);
  });

  router.post("/", async (req, res) => {
    const clientId = clientIdNamed(req);
    const request = issuePermissionGrantRequestSchema.parse(req.body);

    const grant = await issuePermissionGrant(
      database,
      authenticatedViewer(req),
      clientId,
      request.viewerId,
    );

    const body: PermissionGrantResponse = { grant };
    res.status(201).json(body);
  });

  // A Viewer who does not exist answers 404 here, not 400 as in issuing, because this
  // path names the Grant and there is no such Grant.
  router.delete("/:viewerId", async (req, res) => {
    const clientId = clientIdNamed(req);
    const viewerId = viewerIdNamed(req);

    await revokePermissionGrant(database, authenticatedViewer(req), clientId, viewerId);

    res.status(204).end();
  });

  return router;
}
