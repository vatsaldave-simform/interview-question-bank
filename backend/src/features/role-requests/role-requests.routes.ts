import {
  raiseRoleRequestRequestSchema,
  type RoleRequest,
  type RoleRequestListResponse,
  type RoleRequestResponse,
} from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { findRoleRequestsOf, type RoleRequestFromDb } from "./role-requests.repository.ts";
import { raiseRoleRequest } from "./role-requests.service.ts";
import type { Database } from "../../platform/database.ts";

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

  // How a requester reads the reason their Role Request was denied.
  router.get("/mine", async (req, res) => {
    const roleRequests = await findRoleRequestsOf(database, authenticatedViewer(req).id);

    const body: RoleRequestListResponse = { roleRequests: roleRequests.map(toRoleRequest) };
    res.json(body);
  });

  return router;
}
