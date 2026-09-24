import type { Viewer } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";

/** Everything a response or a permission check may see. Never the stored credential. */
const publicFields = { id: true, email: true, role: true, isAdministrator: true } as const;

export type ViewerWithCredential = Viewer & { passwordHash: string };

/** The one place the stored credential is read, so it is easy to see that it is one. */
export function findViewerByEmail(
  database: Database,
  email: string,
): Promise<ViewerWithCredential | null> {
  return database.viewer.findUnique({
    where: { email },
    select: { ...publicFields, passwordHash: true },
  });
}

/**
 * Read on every authenticated request rather than trusted from the token, so that a
 * change to a Viewer takes effect on their next request instead of when their token
 * happens to expire.
 */
export function findViewerById(database: Database, id: string): Promise<Viewer | null> {
  return database.viewer.findUnique({ where: { id }, select: publicFields });
}
