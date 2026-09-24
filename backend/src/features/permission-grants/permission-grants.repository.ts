import type { PermissionGrant } from "@iqb/shared";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

const publicFields = {
  client: { select: { id: true, name: true } },
  viewer: { select: { id: true, email: true } },
} as const;

export function insertPermissionGrant(
  database: DatabaseOrTransaction,
  clientId: string,
  viewerId: string,
): Promise<PermissionGrant> {
  return database.permissionGrant.create({ data: { clientId, viewerId }, select: publicFields });
}

export function findPermissionGrantsForClient(
  database: Database,
  clientId: string,
): Promise<PermissionGrant[]> {
  return database.permissionGrant.findMany({
    where: { clientId },
    orderBy: { viewer: { email: "asc" } },
    select: publicFields,
  });
}

/** Deletes the row rather than marking it: every Question read checks whether the row is
 * there, and the Change Event is what remembers it was (spec #20). */
export function deletePermissionGrant(
  database: DatabaseOrTransaction,
  clientId: string,
  viewerId: string,
): Promise<PermissionGrant> {
  return database.permissionGrant.delete({
    where: { viewerId_clientId: { viewerId, clientId } },
    select: publicFields,
  });
}
