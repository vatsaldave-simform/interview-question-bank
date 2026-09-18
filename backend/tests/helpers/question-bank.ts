import type { Viewer, ViewerRole } from "@iqb/shared";
import { seedClientAndGrants } from "../../src/features/clients/clients.seed.js";
import { seedQuestionBank } from "../../src/features/questions/questions.seed.js";
import { seedViewerAccounts } from "../../src/features/viewers/viewers.seed.js";
import type { Database } from "../../src/platform/database.js";
import { seededViewer } from "./auth.js";
import { truncateAll } from "./test-database.js";

/** An empty database filled with the fixtures, in the order the dependencies run. */
export async function seedTheBank(database: Database): Promise<void> {
  await truncateAll(database);
  await seedViewerAccounts(database);
  await seedClientAndGrants(database);
  await seedQuestionBank(database);
}

/** The seeded Viewer of a role, as the scoped query builder wants one. */
export function viewerByRole(database: Database, role: ViewerRole): Promise<Viewer> {
  return database.viewer.findUniqueOrThrow({
    where: { email: seededViewer(role).email },
    select: { id: true, email: true, role: true },
  });
}
