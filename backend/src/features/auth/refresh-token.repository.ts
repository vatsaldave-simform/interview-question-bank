import type { Database } from "../../platform/database.js";

/** Everything rotation needs to judge a presented token, and never the stored hash. */
const judgeableFields = {
  id: true,
  familyId: true,
  viewerId: true,
  expiresAt: true,
  spentAt: true,
  revokedAt: true,
} as const;

export type StoredRefreshToken = {
  id: string;
  familyId: string;
  viewerId: string;
  expiresAt: Date;
  /** When it was rotated away, or null while it is still the family's live token. */
  spentAt: Date | null;
  revokedAt: Date | null;
};

export type NewRefreshToken = {
  familyId: string;
  viewerId: string;
  tokenHash: string;
  expiresAt: Date;
};

export function insertRefreshToken(
  database: Database,
  token: NewRefreshToken,
): Promise<StoredRefreshToken> {
  return database.refreshToken.create({ data: token, select: judgeableFields });
}

export function findRefreshTokenByHash(
  database: Database,
  tokenHash: string,
): Promise<StoredRefreshToken | null> {
  return database.refreshToken.findUnique({ where: { tokenHash }, select: judgeableFields });
}

/**
 * Marks a token rotated away, and answers whether this caller was the one that did it.
 * The `spentAt: null` in the filter is what makes that answer true: two requests
 * arriving with the same token race here, and the database decides which wins rather
 * than a read-then-write that would let both rotate.
 */
export async function spendRefreshToken(database: Database, id: string): Promise<boolean> {
  const { count } = await database.refreshToken.updateMany({
    where: { id, spentAt: null },
    data: { spentAt: new Date() },
  });
  return count === 1;
}

/**
 * Already-revoked members keep their original moment, so the record still says when the
 * family actually ended.
 */
export async function revokeRefreshTokenFamily(database: Database, familyId: string): Promise<void> {
  await database.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
