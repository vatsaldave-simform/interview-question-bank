import type { Database } from "../../platform/database.js";
import { seedViewerByRole } from "../viewers/viewers.seed.js";

export const seedClient = { name: "Northwind Trading" } as const;

/**
 * Who holds a Permission Grant for that Client, and — just as deliberately — who does
 * not. The Reviewer is left without one, which is the case that proves review is not a
 * visibility bypass (ADR-0013); a Grant is a separate fact from a role, so the Reader
 * holding one is not an oversight either.
 */
export const seedGrantedViewerEmails: readonly string[] = [
  seedViewerByRole("author").email,
  seedViewerByRole("reader").email,
];

/** Idempotent, and leaves an existing Client and its Grants untouched. */
export async function seedClientAndGrants(database: Database): Promise<void> {
  const client = await database.client.upsert({
    where: { name: seedClient.name },
    update: {},
    create: { name: seedClient.name },
    select: { id: true },
  });

  for (const email of seedGrantedViewerEmails) {
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
