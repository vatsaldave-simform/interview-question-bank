import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../../platform/database.ts";
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  refreshTokenFamilyIsRevoked,
  revokeRefreshTokenFamily,
  spendRefreshToken,
  type StoredRefreshToken,
} from "./refresh-token.repository.ts";
import { log } from "../../platform/logger.ts";

/** Long enough that the token needs no structure of its own to verify (ADR-0022). */
const tokenBytes = 32;

/** Read from the environment once at startup, as the access token's is. */
export type RefreshTokenConfig = {
  /** How long a freshly issued token is good for, measured from now (ADR-0008). */
  lifetimeSeconds: number;
};

/** The token itself, and when the cookie holding it should die. */
export type IssuedRefreshToken = { token: string; expiresAt: Date };

/** Why a presented token was refused. The caller is told nothing but that it was. */
export type RotationRefusal = "unknown" | "expired" | "revoked" | "reused";

export type RotationResult =
  | { rotated: true; viewerId: string; refreshToken: IssuedRefreshToken }
  | { rotated: false; reason: RotationRefusal };

/** The token a caller holds; it is in their cookie and nowhere else in the clear. */
export function mintRefreshToken(): string {
  return randomBytes(tokenBytes).toString("base64url");
}

/** SHA-256 rather than argon2id, and why that is not a mistake: ADR-0022. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function findPresented(
  database: Database,
  presented: string,
): Promise<StoredRefreshToken | null> {
  return findRefreshTokenByHash(database, hashRefreshToken(presented));
}

async function issueInto(
  database: Database,
  familyId: string,
  viewerId: string,
  { lifetimeSeconds }: RefreshTokenConfig,
): Promise<IssuedRefreshToken> {
  const token = mintRefreshToken();
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1_000);
  await insertRefreshToken(database, {
    familyId,
    viewerId,
    tokenHash: hashRefreshToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

/** Starts a family, which is what a login does; revoking it later ends this session alone. */
export function issueRefreshToken(
  database: Database,
  viewerId: string,
  config: RefreshTokenConfig,
): Promise<IssuedRefreshToken> {
  return issueInto(database, randomUUID(), viewerId, config);
}

async function endFamily(
  database: Database,
  stored: StoredRefreshToken,
  reason: RotationRefusal,
): Promise<RotationResult> {
  log().warn({ familyId: stored.familyId, viewerId: stored.viewerId }, "refresh token family revoked");
  await revokeRefreshTokenFamily(database, stored.familyId);
  return { rotated: false, reason };
}

/** Exchanges a presented token for its successor, or ends the family (ADR-0023). */
export async function rotateRefreshToken(
  database: Database,
  presented: string,
  config: RefreshTokenConfig,
): Promise<RotationResult> {
  const stored = await findPresented(database, presented);
  if (!stored) return { rotated: false, reason: "unknown" };
  if (stored.revokedAt !== null) return { rotated: false, reason: "revoked" };
  // Before the expiry check, so that waiting does not launder a reuse (ADR-0023).
  if (stored.spentAt !== null) return endFamily(database, stored, "reused");
  if (stored.expiresAt.getTime() <= Date.now()) return { rotated: false, reason: "expired" };

  // Losing is the same fact arriving a moment later: someone else spent this token.
  if (!(await spendRefreshToken(database, stored.id))) return endFamily(database, stored, "reused");

  const issued = await issueInto(database, stored.familyId, stored.viewerId, config);

  // A concurrent reuse may have revoked the family between that spend and this insert,
  // and its revocation could not have reached a row that did not exist yet; without
  // this the successor would outlive the family it belongs to (ADR-0023).
  if (await refreshTokenFamilyIsRevoked(database, stored.familyId)) {
    return endFamily(database, stored, "revoked");
  }

  return { rotated: true, viewerId: stored.viewerId, refreshToken: issued };
}

/** Ends the session a token belongs to; a token nobody holds is not an error. */
export async function revokeRefreshTokenFamilyOf(
  database: Database,
  presented: string,
): Promise<void> {
  const stored = await findPresented(database, presented);
  if (!stored) return;
  await revokeRefreshTokenFamily(database, stored.familyId);
}
