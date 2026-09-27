import {
  decideRoleRequestRequestSchema,
  raiseRoleRequestRequestSchema,
  type RoleRequest,
  type RoleRequestListResponse,
  type RoleRequestResponse,
} from "@iqb/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireAdministrator } from "../auth/require-administrator.middleware.ts";
import {
  findOpenRoleRequests,
  findRoleRequestsOf,
  type RoleRequestFromDb,
} from "./role-requests.repository.ts";
import { denyRoleRequest, grantRoleRequest, raiseRoleRequest } from "./role-requests.service.ts";
import type { Database } from "../../platform/database.ts";
import { InvalidRequestError } from "../../platform/errors.ts";

const roleRequestIdSchema = z.uuid();

function roleRequestIdNamed(req: Request): string {
  const id = roleRequestIdSchema.safeParse(req.params["id"]);
  if (!id.success) throw new InvalidRequestError("Not a valid Role Request id.");
  return id.data;
}

function toRoleRequest(roleRequest: RoleRequestFromDb): RoleRequest {
  return {
    ...roleRequest,
    createdAt: roleRequest.createdAt.toISOString(),
    decidedAt: roleRequest.decidedAt?.toISOString() ?? null,
  };
}

export function roleRequestRoutes(database: Database): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const request = raiseRoleRequestRequestSchema.parse(req.body);

    const roleRequest = await raiseRoleRequest(database, authenticatedViewer(req), request.role);

    const body: RoleRequestResponse = { roleRequest: toRoleRequest(roleRequest) };
    res.status(201).json(body);
  });

  router.get("/mine", async (req, res) => {
    const roleRequests = await findRoleRequestsOf(database, authenticatedViewer(req).id);

    const body: RoleRequestListResponse = { roleRequests: roleRequests.map(toRoleRequest) };
    res.json(body);
  });

  // The check sits on these two routes and not the router, because raising a Role Request
  // and reading your own are open to every Viewer.
  router.get("/", requireAdministrator(), async (_req, res) => {
    const roleRequests = await findOpenRoleRequests(database);

    const body: RoleRequestListResponse = { roleRequests: roleRequests.map(toRoleRequest) };
    res.json(body);
  });

  router.post("/:id/decision", requireAdministrator(), async (req, res) => {
    const id = roleRequestIdNamed(req);
    const decision = decideRoleRequestRequestSchema.parse(req.body);
    const actingViewer = authenticatedViewer(req);

    const roleRequest =
      decision.outcome === "granted"
        ? await grantRoleRequest(database, actingViewer, id, decision.reason ?? null)
        : await denyRoleRequest(database, actingViewer, id, decision.reason);

    const body: RoleRequestResponse = { roleRequest: toRoleRequest(roleRequest) };
    res.json(body);
  });

  return router;
}
