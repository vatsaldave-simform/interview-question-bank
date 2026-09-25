import type { DatabaseOrTransaction, Transaction } from "../../platform/database.ts";

export type NewPasswordToken = {
  viewerId: string;
  tokenHash: string;
  expiresAt: Date;
};

export async function insertPasswordToken(
  database: DatabaseOrTransaction,
  token: NewPasswordToken,
): Promise<void> {
  await database.passwordToken.create({ data: token, select: { id: true } });
}

/**
 * Held until the transaction ends, and taken on the Viewer's id rather than their row, so
 * it holds up only another reset for them while a mail is sent (ADR-0040).
 */
export async function lockPasswordResetsOf(
  transaction: Transaction,
  viewerId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${viewerId}::text, 0))`;
}

/** Spent tokens count too, so a link used a moment ago still holds back the next mail. */
export async function wasPasswordTokenIssuedSince(
  database: DatabaseOrTransaction,
  viewerId: string,
  since: Date,
): Promise<boolean> {
  const issued = await database.passwordToken.findFirst({
    where: { viewerId, createdAt: { gte: since } },
    select: { id: true },
  });
  return issued !== null;
}

/** Marked spent rather than deleted, so a Viewer has at most one link that works. */
export async function endUnusedPasswordTokensOf(
  database: DatabaseOrTransaction,
  viewerId: string,
): Promise<void> {
  await database.passwordToken.updateMany({
    where: { viewerId, spentAt: null },
    data: { spentAt: new Date() },
  });
}

/**
 * Spends the presented token and every other unused one the Viewer holds, in one
 * statement, so that of two requests racing with one token, or with two of the same
 * Viewer's, the database lets exactly one through.
 */
export async function spendPasswordTokenByHash(
  database: DatabaseOrTransaction,
  tokenHash: string,
): Promise<string | null> {
  const now = new Date();
  const spent = await database.passwordToken.updateManyAndReturn({
    where: {
      spentAt: null,
      viewer: {
        // A Deactivated Viewer's token is left unspent, so it works again once they are reactivated.
        isDeactivated: false,
        passwordTokens: { some: { tokenHash, spentAt: null, expiresAt: { gt: now } } },
      },
    },
    data: { spentAt: now },
    select: { viewerId: true, tokenHash: true },
  });
  // A request that lost a race still matches the Viewer, but finds the presented row
  // already spent and so leaves it out.
  return spent.find((row) => row.tokenHash === tokenHash)?.viewerId ?? null;
}
