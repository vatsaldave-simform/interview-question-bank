import type { CategoryListResponse } from "@iqb/shared";
import { Router } from "express";
import type { Database } from "../../platform/database.ts";
import { findEveryCategoryWithTags } from "./categories.repository.ts";

export function categoryRoutes(database: Database): Router {
  const router = Router();

  // No visibility check, unlike every Question route, because no Question owns a Tag and
  // the filter already shows which Tags exist (ADR-0034).
  router.get("/", async (_req, res) => {
    const body: CategoryListResponse = { categories: await findEveryCategoryWithTags(database) };
    res.json(body);
  });

  return router;
}
