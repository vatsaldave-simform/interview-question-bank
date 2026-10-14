import type {
  Client,
  PermissionGrant,
  PermissionGrantIssued,
  PermissionGrantRevoked,
  Viewer,
} from "@iqb/shared";
import { Prisma } from "../../generated/prisma/client.ts";
import { insertChangeEvent } from "../change-events/change-events.repository.ts";
import { findClientById } from "../clients/clients.repository.ts";
import { findViewerById } from "../viewers/viewers.repository.ts";
import {
  deletePermissionGrant,
  findPermissionGrantsForClient,
  insertPermissionGrant,
} from "./permission-grants.repository.ts";
import type { Database } from "../../platform/database.ts";
import { ConflictError, InvalidRequestError, NotFoundError } from "../../platform/errors.ts";

/** Only an Administrator gets here, and an Administrator may know every Client exists, so
 * a 404 for one that does not is no leak. */
async function getClient(database: Database, id: string): Promise<Client> {
  const client = await findClientById(database, id);
  if (client === null) throw new NotFoundError();
  return client;
}

/** An Administrator may issue a Grant to themselves, kept honest by the Change Event
 * naming them as the one who issued it (ADR-0015). */
export async function issuePermissionGrant(
  database: Database,
  viewer: Viewer,
  clientId: string,
  targetId: string,
): Promise<PermissionGrant> {
  const client = await getClient(database, clientId);
  const target = await findViewerById(database, targetId);
  if (target === null) throw new InvalidRequestError("No Viewer has that id.");

  try {
    return await database.$transaction(async (transaction) => {
      const grant = await insertPermissionGrant(transaction, client.id, target.id);
      const payload: PermissionGrantIssued = { grant };
      await insertChangeEvent(transaction, {
        type: "permission_grant_issued",
        questionId: null,
        viewerId: viewer.id,
        payload,
      });
      return grant;
    });
  } catch (error) {
    // Caught from the unique index rather than checked first, so two requests racing to
    // issue one Grant cannot both pass the check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("That Viewer already holds a Grant for that Client.");
    }
    throw error;
  }
}

export async function listPermissionGrants(
  database: Database,
  clientId: string,
): Promise<PermissionGrant[]> {
  const client = await getClient(database, clientId);
  return findPermissionGrantsForClient(database, client.id);
}

/** Takes effect on the Viewer's next request with no more work, because no read keeps a
 * copy of who holds which Grant. */
export async function revokePermissionGrant(
  database: Database,
  viewer: Viewer,
  clientId: string,
  targetId: string,
): Promise<void> {
  try {
    await database.$transaction(async (transaction) => {
      const grant = await deletePermissionGrant(transaction, clientId, targetId);
      const payload: PermissionGrantRevoked = { grant };
      await insertChangeEvent(transaction, {
        type: "permission_grant_revoked",
        questionId: null,
        viewerId: viewer.id,
        payload,
      });
    });
  } catch (error) {
    // The delete itself says the Grant was not there, so two racing revokes record one event.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new NotFoundError();
    }
    throw error;
  }
}
