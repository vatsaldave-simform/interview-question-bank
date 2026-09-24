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
