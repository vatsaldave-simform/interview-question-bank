import type {
  AdministratorAppointed,
  AdministratorWithdrawn,
  RoleChanged,
  Viewer,
  ViewerCreated,
  ViewerDeactivated,
  ViewerReactivated,
  ViewerRole,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { issuePasswordToken } from "../auth/password-token.ts";
import { revokeRefreshTokensOfViewer } from "../auth/refresh-token.repository.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import {
  countOtherActiveAdministrators,
  findViewerById,
  insertViewer,
  setIsAdministrator,
  setIsDeactivated,
  setRole,
} from "../viewers/viewers.repository.ts";
import { setPasswordMessage, type SetPasswordLinkConfig } from "./set-password-mail.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError, NotFoundError } from "../../platform/errors.ts";
import { log } from "../../platform/logger.ts";
import type { Mailer } from "../../platform/mail.ts";

export type SetPasswordMailDependencies = { mailer: Mailer; settings: SetPasswordLinkConfig };

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
 * Refused when no other active Administrator would remain: the system can never be left
 * with nobody who can appoint a replacement (ADR-0015).
 */
export async function withdrawAdministrator(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (!target.isAdministrator) return target;

  return database.$transaction(async (transaction) => {
    if ((await countOtherActiveAdministrators(transaction, target.id)) === 0) {
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

/**
 * Their refresh tokens are revoked in the same transaction, so no session survives on
 * rotation. The last active Administrator is refused, as withdrawing is (ADR-0015).
 */
export async function deactivateViewer(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (target.isDeactivated) return target;

  return database.$transaction(async (transaction) => {
    if (
      target.isAdministrator &&
      (await countOtherActiveAdministrators(transaction, target.id)) === 0
    ) {
      throw new ConflictError("The last active Administrator cannot be Deactivated.");
    }

    const deactivated = await setIsDeactivated(transaction, target.id, true);
    await revokeRefreshTokensOfViewer(transaction, target.id);
    const payload: ViewerDeactivated = { viewer: affectedViewer(deactivated) };
    await insertChangeEvent(transaction, {
      type: "viewer_deactivated",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return deactivated;
  });
}

/** Their Permission Grants were never touched, so they come back with the same access
 * (ADR-0017). */
export async function reactivateViewer(
  database: Database,
  actingViewer: Viewer,
  targetId: string,
): Promise<Viewer> {
  const target = await targetNamed(database, targetId);
  if (!target.isDeactivated) return target;

  return database.$transaction(async (transaction) => {
    const reactivated = await setIsDeactivated(transaction, target.id, false);
    const payload: ViewerReactivated = { viewer: affectedViewer(reactivated) };
    await insertChangeEvent(transaction, {
      type: "viewer_reactivated",
      questionId: null,
      viewerId: actingViewer.id,
      payload,
    });
    return reactivated;
  });
}

/**
 * The mail is sent last, inside the transaction, so a send that fails leaves no Viewer
 * behind and the Administrator can simply try again instead of meeting a 409.
 */
export async function createViewer(
  database: Database,
  { mailer, settings }: SetPasswordMailDependencies,
  actingViewer: Viewer,
  email: string,
  role: ViewerRole,
): Promise<Viewer> {
  try {
    const created = await database.$transaction(
      async (transaction) => {
        const inserted = await insertViewer(transaction, email, role);
        const payload: ViewerCreated = { viewer: affectedViewer(inserted), role: inserted.role };
        await insertChangeEvent(transaction, {
          type: "viewer_created",
          questionId: null,
          viewerId: actingViewer.id,
          payload,
        });
        const issued = await issuePasswordToken(transaction, inserted.id, settings);
        await mailer.send(setPasswordMessage(inserted.email, issued, settings.appUrl));
        return inserted;
      },
      // Past Prisma's five seconds, which a slow but working mail server can take; a send
      // that outlasts even this rolls back after the mail has gone, and its link never works.
      { timeout: 20_000 },
    );
    log().info({ viewerId: created.id }, "set-password link mailed");
    return created;
  } catch (error) {
    // Caught from the unique index rather than checked first, so two requests racing for
    // one address cannot both pass the check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A Viewer with that email address already exists.");
    }
    throw error;
  }
}
