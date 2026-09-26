import type { RoleRequestDenied, RoleRequestGranted, Viewer, ViewerRole } from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import { findViewerById, lockViewer, setRole } from "../viewers/viewers.repository.ts";
import {
  decideRoleRequest,
  findRoleRequestById,
  insertRoleRequest,
  type RoleRequestDecision,
  type RoleRequestFromDb,
} from "./role-requests.repository.ts";
import type { Database, Transaction } from "../../platform/database.ts";
import { ConflictError, NotFoundError } from "../../platform/errors.ts";

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

/** Only an Administrator gets here, and they may know every Role Request exists, so a 404
 * for one that does not is no leak. */
async function decidedWhileOpen(
  transaction: Transaction,
  id: string,
  decision: RoleRequestDecision,
): Promise<RoleRequestFromDb> {
  const decided = await decideRoleRequest(transaction, id, decision);
  if (decided !== null) return decided;
  if ((await findRoleRequestById(transaction, id)) === null) throw new NotFoundError();
  throw new ConflictError("That Role Request has already been decided.");
}

/**
 * Granted even when the requester already holds the role, because an Administrator set it
 * directly in the meantime: the decision still happened, so it is still recorded.
 */
export async function grantRoleRequest(
  database: Database,
  actingViewer: Viewer,
  id: string,
  reason: string | null,
): Promise<RoleRequestFromDb> {
  return database.$transaction(async (transaction) => {
    const granted = await decidedWhileOpen(transaction, id, { state: "granted", reason });

    // Read after the lock, so a direct role change at the same moment cannot make the
    // event's "before" wrong (ADR-0039).
    await lockViewer(transaction, granted.viewer.id);
    const requester = await findViewerById(transaction, granted.viewer.id);
    if (requester === null) throw new Error("A Role Request names a Viewer that is not there.");
    if (requester.role !== granted.role) await setRole(transaction, requester.id, granted.role);

    const payload: RoleRequestGranted = {
      roleRequestId: granted.id,
      viewer: granted.viewer,
      role: { before: requester.role, after: granted.role },
      reason,
    };
    await insertChangeEvent(transaction, {
      type: "role_request_granted",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return granted;
  });
}

export async function denyRoleRequest(
  database: Database,
  actingViewer: Viewer,
  id: string,
  reason: string,
): Promise<RoleRequestFromDb> {
  return database.$transaction(async (transaction) => {
    const denied = await decidedWhileOpen(transaction, id, { state: "denied", reason });

    const payload: RoleRequestDenied = {
      roleRequestId: denied.id,
      viewer: denied.viewer,
      role: denied.role,
      reason,
    };
    await insertChangeEvent(transaction, {
      type: "role_request_denied",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return denied;
  });
}
