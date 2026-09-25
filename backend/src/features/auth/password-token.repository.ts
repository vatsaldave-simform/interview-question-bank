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

/**
 * Marks a live token used and answers whose it was, in one statement. Two requests
 * arriving with the same token race here, and the database decides which one gets the
 * answer, rather than a read-then-write that would let both through.
 */
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
