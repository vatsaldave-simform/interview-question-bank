import type { Client } from "@iqb/shared";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

const publicFields = { id: true, name: true } as const;

/** Only the Clients the Viewer holds a Permission Grant for, the same condition every
 * Question read uses, so a picker never reveals that an engagement exists. */
export function findClientsGrantedTo(database: Database, viewerId: string): Promise<Client[]> {
  return database.client.findMany({
    where: { permissionGrants: { some: { viewerId } } },
    orderBy: { name: "asc" },
    select: publicFields,
  });
}

export function insertClient(database: DatabaseOrTransaction, name: string): Promise<Client> {
  return database.client.create({ data: { name }, select: publicFields });
}
