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

/** One statement, so that of two requests racing with one token the database lets exactly
 * one through, where a read-then-write would let both. */
export async function spendPasswordTokenByHash(
  database: DatabaseOrTransaction,
  tokenHash: string,
): Promise<string | null> {
  const now = new Date();
  const [spent] = await database.passwordToken.updateManyAndReturn({
    where: { tokenHash, spentAt: null, expiresAt: { gt: now } },
    data: { spentAt: now },
    select: { viewerId: true },
  });
  return spent?.viewerId ?? null;
}
