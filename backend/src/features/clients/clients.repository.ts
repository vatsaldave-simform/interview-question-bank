import type { Client } from "@iqb/shared";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

export function findEveryClient(database: Database): Promise<Client[]> {
  return database.client.findMany({ orderBy: { name: "asc" }, select: publicFields });
}

export function findClientById(database: Database, id: string): Promise<Client | null> {
  return database.client.findUnique({ where: { id }, select: publicFields });
}

export function insertClient(database: DatabaseOrTransaction, name: string): Promise<Client> {
  return database.client.create({ data: { name }, select: publicFields });
}

const publicFields = { id: true, name: true } as const;
