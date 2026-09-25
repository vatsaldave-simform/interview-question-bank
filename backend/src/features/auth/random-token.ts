import { createHash, randomBytes } from "node:crypto";

/** Long enough that the token needs no structure of its own to verify (ADR-0022). */
const tokenBytes = 32;

/** A token only its holder has in the clear: in a cookie, or in a mailed link. */
export function mintRandomToken(): string {
  return randomBytes(tokenBytes).toString("base64url");
}

/** SHA-256 rather than argon2id, and why that is not a mistake: ADR-0022. */
export function hashRandomToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
