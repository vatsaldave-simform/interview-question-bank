import type { Database } from "../../platform/database.ts";

export type SeedClient = { name: string };

/** The Client most of the seeded bank names. */
export const seedClient: SeedClient = { name: "Northwind Trading" };

/** A second Client, so a filter or a Question can name more than one. */
export const seedOtherClient: SeedClient = { name: "Kingsbridge Health" };

export const seedClients: readonly SeedClient[] = [seedClient, seedOtherClient];

/** Safe to run twice, and leaves an existing Client untouched. */
export async function seedClientList(
  database: Database,
  clients: readonly SeedClient[] = seedClients,
): Promise<void> {
  for (const seeded of clients) {
    await database.client.upsert({
      where: { name: seeded.name },
      update: {},
      create: { name: seeded.name },
    });
  }
}
