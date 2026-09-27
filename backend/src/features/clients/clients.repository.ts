import type { Client } from "@iqb/shared";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

const publicFields = { id: true, name: true } as const;

/** Only the Clients the Viewer holds a Permission Grant for, the same condition every
 * Question read uses, so a Viewer's own list never reveals that a Client exists. */
export function findClientsGrantedTo(database: Database, viewerId: string): Promise<Client[]> {
  return database.client.findMany({
    where: { permissionGrants: { some: { viewerId } } },
    orderBy: { name: "asc" },
    select: publicFields,
  });
}

/** Null for a Client the Viewer holds no Grant for, exactly as for one that does not exist. */
export function findClientGrantedTo(
  database: DatabaseOrTransaction,
  viewerId: string,
  clientId: string,
): Promise<Client | null> {
  return database.client.findFirst({
    where: { id: clientId, permissionGrants: { some: { viewerId } } },
    select: publicFields,
  });
}

/** For an Administrator only (ADR-0042): a Viewer's own list goes through the Grant condition
 * above. */
export function findEveryClient(database: Database): Promise<Client[]> {
  return database.client.findMany({ orderBy: { name: "asc" }, select: publicFields });
}

/** For administrative acts only: a Viewer's own reads go through the Grant condition above. */
export function findClientById(database: Database, id: string): Promise<Client | null> {
  return database.client.findUnique({ where: { id }, select: publicFields });
}

export function insertClient(database: DatabaseOrTransaction, name: string): Promise<Client> {
  return database.client.create({ data: { name }, select: publicFields });
}
