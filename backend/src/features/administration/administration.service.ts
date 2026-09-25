import type {
  AdministratorAppointed,
  AdministratorWithdrawn,
  RoleChanged,
  Viewer,
  ViewerCreated,
  ViewerRole,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import {
  countAdministrators,
  findViewerById,
  insertViewer,
  setIsAdministrator,
  setRole,
} from "../viewers/viewers.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError, NotFoundError } from "../../platform/errors.ts";

async function targetNamed(database: Database, id: string): Promise<Viewer> {
  const target = await findViewerById(database, id);
  if (target === null) throw new NotFoundError();
  return target;
}

/** Every administrative act, whatever it does to the target Viewer, in the shape the
 * Change Event names it (ADR-0035). */
function affectedViewer(viewer: Viewer) {
  return { id: viewer.id, email: viewer.email };
}

/**
 * Appointing is never refused: any Administrator, escalation included, is allowed
 * (ADR-0015), and the acting Viewer may name themselves as the target.
 */
export async function appointAdministrator(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (target.isAdministrator) return target;

  return database.$transaction(async (transaction) => {
    const appointed = await setIsAdministrator(transaction, target.id, true);
    const payload: AdministratorAppointed = { viewer: affectedViewer(appointed) };
    await insertChangeEvent(transaction, {
      type: "administrator_appointed",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return appointed;
  });
}

/**
 * Refused when the target is the only remaining Administrator: the system can never be
 * left with nobody who can appoint a replacement (ADR-0015).
 */
export async function withdrawAdministrator(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (!target.isAdministrator) return target;

  return database.$transaction(async (transaction) => {
    const remaining = await countAdministrators(transaction);
    if (remaining <= 1) {
      throw new ConflictError("The last Administrator's authority cannot be withdrawn.");
    }

    const withdrawn = await setIsAdministrator(transaction, target.id, false);
    const payload: AdministratorWithdrawn = { viewer: affectedViewer(withdrawn) };
    await insertChangeEvent(transaction, {
      type: "administrator_withdrawn",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return withdrawn;
  });
}

/** No ladder between roles, and no Role Request needed: an Administrator sets any role
 * directly (spec #20). */
export async function changeRole(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
  role: ViewerRole,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (target.role === role) return target;

  return database.$transaction(async (transaction) => {
    const changed = await setRole(transaction, target.id, role);
    const payload: RoleChanged = {
      viewer: affectedViewer(changed),
      role: { before: target.role, after: role },
    };
    await insertChangeEvent(transaction, {
      type: "role_changed",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return changed;
  });
}

export async function createViewer(
  database: Database,
  actingViewer: Viewer,
  email: string,
  role: ViewerRole,
): Promise<Viewer> {
  try {
    return await database.$transaction(async (transaction) => {
      const created = await insertViewer(transaction, email, role);
      const payload: ViewerCreated = { viewer: affectedViewer(created), role: created.role };
      await insertChangeEvent(transaction, {
        type: "viewer_created",
        questionId: null,
        viewerId: actingViewer.id,
        payload,
      });
      return created;
    });
  } catch (error) {
    // Caught from the unique index rather than checked first, so two requests racing for
    // one address cannot both pass the check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A Viewer with that email address already exists.");
    }
    throw error;
  }
}
