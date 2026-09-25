import type { Viewer, ViewerRole } from "@iqb/shared";
import type { Database, DatabaseOrTransaction } from "../../platform/database.ts";

/** Everything a response or a permission check may see. Never the stored credential. */
const publicFields = {
  id: true,
  email: true,
  role: true,
  isAdministrator: true,
  isDeactivated: true,
} as const;

/** Null until the Viewer sets a password, so every reader has to say what that means. */
export type ViewerWithCredential = Viewer & { passwordHash: string | null };

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

/** Deactivated Administrators are not counted, because they cannot log in to appoint a
 * replacement (ADR-0015). Read inside the same transaction as the write it guards. */
export function countOtherActiveAdministrators(
  database: DatabaseOrTransaction,
  id: string,
): Promise<number> {
  return database.viewer.count({
    where: { isAdministrator: true, isDeactivated: false, id: { not: id } },
  });
}

export function setIsAdministrator(
  database: DatabaseOrTransaction,
  id: string,
  isAdministrator: boolean,
): Promise<Viewer> {
  return database.viewer.update({ where: { id }, data: { isAdministrator }, select: publicFields });
}

export function setIsDeactivated(
  database: DatabaseOrTransaction,
  id: string,
  isDeactivated: boolean,
): Promise<Viewer> {
  return database.viewer.update({ where: { id }, data: { isDeactivated }, select: publicFields });
}

export function setRole(
  database: DatabaseOrTransaction,
  id: string,
  role: ViewerRole,
): Promise<Viewer> {
  return database.viewer.update({ where: { id }, data: { role }, select: publicFields });
}

/** Takes a hash, never a password, so nothing written here can be the credential itself. */
export async function setPasswordHash(
  database: DatabaseOrTransaction,
  id: string,
  passwordHash: string,
): Promise<void> {
  await database.viewer.update({ where: { id }, data: { passwordHash }, select: { id: true } });
}

export function insertViewer(
  database: DatabaseOrTransaction,
  email: string,
  role: ViewerRole,
): Promise<Viewer> {
  return database.viewer.create({ data: { email, role }, select: publicFields });
}
