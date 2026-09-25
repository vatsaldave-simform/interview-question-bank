import type { DatabaseOrTransaction } from "../../platform/database.ts";
import { insertPasswordToken, spendPasswordTokenByHash } from "./password-token.repository.ts";
import { hashRandomToken, mintRandomToken } from "./random-token.ts";

/** Read from the environment once at startup, as the refresh token's is. */
export type PasswordTokenConfig = {
  /** How long a freshly issued token is good for, measured from now. */
  lifetimeSeconds: number;
};

/** The token itself, for the link, and when it stops working, for the mail to say. */
export type IssuedPasswordToken = { token: string; expiresAt: Date };

export async function issuePasswordToken(
  database: DatabaseOrTransaction,
  viewerId: string,
  { lifetimeSeconds }: PasswordTokenConfig,
): Promise<IssuedPasswordToken> {
  const token = mintRandomToken();
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1_000);
  await insertPasswordToken(database, { viewerId, tokenHash: hashRandomToken(token), expiresAt });
  return { token, expiresAt };
}

/**
 * Uses the token up and answers who it was issued for. Unknown, expired and already used
 * are one answer, null, because the caller can do nothing different about any of them.
 */
export function spendPasswordToken(
  database: DatabaseOrTransaction,
  presented: string,
): Promise<string | null> {
  return spendPasswordTokenByHash(database, hashRandomToken(presented));
}
