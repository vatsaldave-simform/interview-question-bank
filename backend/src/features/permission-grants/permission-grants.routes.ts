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

function idNamed(req: Request, param: "clientId" | "viewerId", what: string): string {
  const id = idSchema.safeParse(req.params[param]);
  if (!id.success) throw new InvalidRequestError(`Not a valid ${what} id.`);
  return id.data;
}

/**
 * Mounted under a Client, so it has to be given the Client's id from the path above it.
 * The Administrator check sits on the router, because every route here is theirs alone.
 */
export function permissionGrantRoutes(database: Database): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAdministrator());

  router.get("/", async (req, res) => {
    const grants = await listPermissionGrants(database, idNamed(req, "clientId", "Client"));

    const body: PermissionGrantListResponse = { grants };
    res.json(body);
  });

  router.post("/", async (req, res) => {
    const clientId = idNamed(req, "clientId", "Client");
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

  router.delete("/:viewerId", async (req, res) => {
    const clientId = idNamed(req, "clientId", "Client");
    const viewerId = idNamed(req, "viewerId", "Viewer");

    await revokePermissionGrant(database, authenticatedViewer(req), clientId, viewerId);

    res.status(204).end();
  });

  return router;
}
