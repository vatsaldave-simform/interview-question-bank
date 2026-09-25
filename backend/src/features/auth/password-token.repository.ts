import type { DatabaseOrTransaction } from "../../platform/database.ts";

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
