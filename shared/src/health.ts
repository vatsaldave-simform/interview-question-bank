import { z } from "zod";

/** Liveness: the process is up and serving. Says nothing about the database. */
export const healthResponseSchema = z.object({ status: z.literal("ok") }).strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Readiness: the process can serve traffic, which here means the database answers. */
export const readinessResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]),
    checks: z.object({ database: z.enum(["up", "down"]) }).strict(),
  })
  .strict();
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
