import type { Viewer, ViewerRole } from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertRoleRequest, type RoleRequestFromDb } from "./role-requests.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError } from "../../platform/errors.ts";

/** Any role other than the one held, so a Reader may ask for Reviewer directly (ADR-0016). */
export async function raiseRoleRequest(
  database: Database,
  requester: Viewer,
  role: ViewerRole,
): Promise<RoleRequestFromDb> {
  if (requester.role === role) throw new ConflictError("You already hold that role.");

  try {
    return await insertRoleRequest(database, requester.id, role);
  } catch (error) {
    // Caught from the partial unique index rather than checked first, so two requests at
    // once cannot both get in (ADR-0041).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("You already have an open Role Request.");
    }
    throw error;
  }
}
