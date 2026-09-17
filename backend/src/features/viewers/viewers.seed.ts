import type { ViewerRole } from "@iqb/shared";
import { hashPassword } from "../auth/password.js";
import type { Database } from "../../platform/database.js";

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

/**
 * Idempotent, and deliberately leaves an existing Viewer untouched: re-running the
 * seed against a database someone has been using must not reset a password or a role
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
