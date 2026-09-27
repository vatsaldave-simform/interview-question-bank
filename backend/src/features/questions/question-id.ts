import type { Request } from "express";
import { z } from "zod";
import { NotFoundError } from "../../platform/errors.ts";

const questionIdSchema = z.uuid();

/** A malformed id is answered as a missing one rather than as a bad request: it names no
 * Question, and there is one answer for that (ADR-0002). */
export function questionIdNamed(req: Request): string {
  const id = questionIdSchema.safeParse(req.params["id"]);
  if (!id.success) throw new NotFoundError();
  return id.data;
}
