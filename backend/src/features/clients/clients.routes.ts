import {
  createClientRequestSchema,
  type ClientListResponse,
  type ClientResponse,
} from "@iqb/shared";
import { Router } from "express";
import { authenticatedViewer } from "../auth/authenticated-viewer.ts";
import { requireAdministrator } from "../auth/require-administrator.middleware.ts";
import { findClientsGrantedTo } from "./clients.repository.ts";
import { createClient } from "./clients.service.ts";
import type { Database } from "../../platform/database.ts";

/** There is deliberately no route that deletes a Client: its Questions' restrictions would
 * point at nothing, and that reads as no restriction at all (ADR-0017). */
export function clientRoutes(database: Database): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const clients = await findClientsGrantedTo(database, authenticatedViewer(req).id);

    const body: ClientListResponse = { clients };
    res.json(body);
  });

  // The check sits on this route and not the router, because listing Clients is open to
  // every Viewer.
  router.post("/", requireAdministrator(), async (req, res) => {
    const request = createClientRequestSchema.parse(req.body);

    const client = await createClient(database, authenticatedViewer(req), request.name);

    const body: ClientResponse = { client };
    res.status(201).json(body);
  });

  return router;
}
