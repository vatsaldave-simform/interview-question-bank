import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id through @node-rs/argon2, at the library's own defaults, which are the
 * OWASP-recommended parameters (ADR-0019). The parameters travel inside every hash
 * this writes, so raising them later leaves existing credentials verifiable rather
 * than locking their owners out.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password.normalize("NFKC"));
}

/**
 * False for a wrong password and for a stored value this cannot read alike: a hash
 * written by something else is not a reason to let anyone in.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, password.normalize("NFKC"));
  } catch {
    return false;
  }
}
