import type { Client } from "@iqb/shared";
import type { DatabaseOrTransaction } from "../../platform/database.ts";

const publicFields = { id: true, name: true } as const;

export function insertClient(database: DatabaseOrTransaction, name: string): Promise<Client> {
  return database.client.create({ data: { name }, select: publicFields });
}
