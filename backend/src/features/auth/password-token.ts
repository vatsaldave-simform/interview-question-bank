import type { DatabaseOrTransaction } from "../../platform/database.ts";
import { insertPasswordToken, spendPasswordTokenByHash } from "./password-token.repository.ts";
import { hashRandomToken, mintRandomToken } from "./random-token.ts";

export type PasswordTokenConfig = { lifetimeSeconds: number };

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

/** Null for an unknown, expired or used token alike, because the caller can do nothing
 * different about any of them. */
export function spendPasswordToken(
  database: DatabaseOrTransaction,
  presented: string,
): Promise<string | null> {
  return spendPasswordTokenByHash(database, hashRandomToken(presented));
}
