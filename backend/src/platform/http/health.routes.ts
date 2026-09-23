import { type HealthResponse, type ReadinessResponse } from "@iqb/shared";
import { Router } from "express";
import type { Database } from "../database.ts";
import { log } from "../logger.ts";

async function databaseIsUp(database: Database): Promise<boolean> {
  try {
    await database.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    log().warn({ err: error }, "readiness check could not reach the database");
    return false;
  }
}

const statusByReadiness: Record<ReadinessResponse["status"], number> = {
  ready: 200,
  not_ready: 503,
};

export function healthRoutes(database: Database): Router {
  const router = Router();

  // Liveness. Says the process is serving, nothing more, so an orchestrator does not
  // restart a healthy API because its database blinked.
  router.get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok" };
    res.json(body);
  });

  // Readiness. The report is the response, so its status code comes from the report
  // rather than from a raised error, and `statusByReadiness` is the only place in the
  // API where a route decides a failure status. Every other failure is an error the
  // middleware maps, and later tickets should follow that path, not this one.
  router.get("/ready", async (_req, res) => {
    const databaseStatus = (await databaseIsUp(database)) ? "up" : "down";
    const body: ReadinessResponse =
      databaseStatus === "up"
        ? { status: "ready", checks: { database: databaseStatus } }
        : { status: "not_ready", checks: { database: databaseStatus } };
    res.status(statusByReadiness[body.status]).json(body);
  });

  return router;
}
