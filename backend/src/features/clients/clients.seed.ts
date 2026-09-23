import type { Database } from "../../platform/database.ts";
import { seedViewerByRole } from "../viewers/viewers.seed.ts";

export type SeedClient = {
  name: string;
  /** Who holds a Permission Grant for it, by email. */
  grantedTo: readonly string[];
};

/**
 * The Client most of the seeded bank hangs from. The Reviewer is deliberately left
 * without a Grant for it, which is the case that proves review is not a visibility
 * bypass (ADR-0013); the Reader holding one shows a Grant is not a role.
 */
export const seedClient: SeedClient = {
  name: "Northwind Trading",
  grantedTo: [seedViewerByRole("author").email, seedViewerByRole("reader").email],
};

/** A second Client, held by the one Viewer the first is kept from: no Viewer holds both,
 * so each Client has someone on either side of it. */
export const seedOtherClient: SeedClient = {
  name: "Kingsbridge Health",
  grantedTo: [seedViewerByRole("reviewer").email],
};

export const seedClients: readonly SeedClient[] = [seedClient, seedOtherClient];

/** Safe to run twice, and leaves an existing Client and its Grants untouched. */
export async function seedClientsAndGrants(database: Database): Promise<void> {
  for (const seeded of seedClients) {
    const client = await database.client.upsert({
      where: { name: seeded.name },
      update: {},
      create: { name: seeded.name },
      select: { id: true },
    });

    for (const email of seeded.grantedTo) {
      const viewer = await database.viewer.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });
      await database.permissionGrant.upsert({
        where: { viewerId_clientId: { viewerId: viewer.id, clientId: client.id } },
        update: {},
        create: { viewerId: viewer.id, clientId: client.id },
      });
    }
  }
}
