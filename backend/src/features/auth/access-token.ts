import { errors, jwtVerify, SignJWT } from "jose";

/**
 * A short-lived access token, as a JWT signed with HS256 (ADR-0008, ADR-0019). One
 * process signs and reads it, so the verifier is pinned to that one algorithm: a
 * token naming any other is refused rather than dispatched on.
 */
const algorithm = "HS256";

/** Read from the environment once at startup and handed to whatever needs it. */
export type AccessTokenConfig = {
  secret: string;
  /** How long a freshly signed token is good for. Short, by design (ADR-0008). */
  lifetimeSeconds: number;
};

/** What a valid token says. Only who it is for: the rest is the verifier's business. */
export type AccessTokenClaims = { viewerId: string };

/** Why a token was refused. It reaches the logs; the caller is told nothing but 401. */
export type RefusalReason = "malformed" | "bad_signature" | "expired";

export type VerificationResult =
  | { valid: true; claims: AccessTokenClaims }
  | { valid: false; reason: RefusalReason };

function signingKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * A JWT's `exp` is a whole number of seconds, so a token is good for up to a second
 * less than its nominal lifetime. Immaterial at fifteen minutes, and the reason a
 * client refreshes on a margin rather than on the last moment.
 */
export async function signAccessToken(
  viewerId: string,
  { secret, lifetimeSeconds }: AccessTokenConfig,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg: algorithm })
    .setSubject(viewerId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetimeSeconds)
    .sign(signingKey(secret));
}

/**
 * Never throws for a bad token: which of the ways it was bad is a fact for the log,
 * and the caller is answered the same either way.
 */
export async function verifyAccessToken(
  token: string,
  { secret }: AccessTokenConfig,
): Promise<VerificationResult> {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: [algorithm],
      // No leeway: a lifetime the suite sets to seconds must expire on time.
      clockTolerance: 0,
    });

    const { sub } = payload;
    if (typeof sub !== "string") return { valid: false, reason: "malformed" };
    return { valid: true, claims: { viewerId: sub } };
  } catch (error) {
    return { valid: false, reason: refusalReason(error) };
  }
}

function refusalReason(error: unknown): RefusalReason {
  if (error instanceof errors.JWTExpired) return "expired";
  if (error instanceof errors.JWSSignatureVerificationFailed) return "bad_signature";
  // Everything else — an unparseable token, a header naming another algorithm, a
  // payload that is not an object — is the caller having presented nonsense.
  return "malformed";
}
