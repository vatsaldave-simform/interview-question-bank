import type { ViewerRole } from "@iqb/shared";
import { hashPassword } from "../auth/password.ts";
import type { Database } from "../../platform/database.ts";

export type SeedViewer = { email: string; password: string; role: ViewerRole };

/**
 * One Viewer per role, with credentials anyone evaluating the bank can use. They are
 * development and test data, published in the README and in this file: there is no
 * registration endpoint, so an environment with no seeded Viewer has nobody who can
 * log in at all (ADR-0016).
 */
export const seedViewers: readonly SeedViewer[] = [
  { email: "reader@iqb.test", password: "reader-password", role: "reader" },
  { email: "author@iqb.test", password: "author-password", role: "author" },
  { email: "reviewer@iqb.test", password: "reviewer-password", role: "reviewer" },
];

/** The seeded Viewer holding a role, for anything that has to name one of them. */
export function seedViewerByRole(role: ViewerRole): SeedViewer {
  const viewer = seedViewers.find((candidate) => candidate.role === role);
  if (!viewer) throw new Error(`No seeded Viewer holds the role ${role}.`);
  return viewer;
}

/**
 * Safe to run twice, and deliberately leaves an existing Viewer untouched: re-running
 * the seed against a database someone has been using must not reset a password or a role
 * they changed.
 */
export async function seedViewerAccounts(database: Database): Promise<void> {
  for (const viewer of seedViewers) {
    await database.viewer.upsert({
      where: { email: viewer.email },
      update: {},
      create: {
        email: viewer.email,
        role: viewer.role,
        passwordHash: await hashPassword(viewer.password),
      },
    });
  }
}
