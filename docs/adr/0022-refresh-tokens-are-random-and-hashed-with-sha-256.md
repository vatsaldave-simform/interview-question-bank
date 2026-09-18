# A refresh token is random, and stored as a SHA-256 of itself

The refresh token ADR-0008 puts in a cookie is 32 bytes from `randomBytes`, base64url
encoded, and the database stores only `sha256(token)`. It carries no claims, no
signature and no structure: it is a lookup key, and whether it is live is a fact about a
row rather than a fact the token asserts about itself.

**Not argon2id, which ADR-0019 chose for passwords.** That decision does not carry over,
and the reason it does not is worth writing down, because "we hash credentials with
argon2id here" is the obvious thing to conclude from it. A password is short, chosen by
a person, and drawn from a space small enough to enumerate — the slowness is the whole
defence. A refresh token is 256 bits from the system CSPRNG, so there is no dictionary
to try and nothing for a slow hash to slow down. What the slowness would cost is real:
this hash runs on every refresh, on the request a Viewer is waiting on, and argon2id is
tuned to take a tenth of a second. It would also have to be *verified* rather than
looked up — argon2id salts every hash, so the same token hashes differently each time,
and finding a presented token would mean scanning rows and verifying each in turn
instead of a unique-index lookup.

**Not a JWT either**, which is the other obvious thing to reach for given that the
access token beside it is one. A signed token is verifiable without the database, which
is exactly what a refresh token must not be: rotation, reuse detection and family
revocation are all statements about what has already happened to this token, and none of
them can be read out of the token itself. A JWT would have to be checked against the
database anyway, and would then be a lookup key with a signature nobody needed.

**Stored hashed rather than in the clear** so that a copy of `refresh_tokens` — a dump,
a backup, a log of a query — is not a set of usable sessions. The database never sees
the token a caller holds, only the digest, and SHA-256 is preimage-resistant on a
256-bit random input.

## Consequences

The token is opaque, so nothing but the database can say who it belongs to or when it
expires; `expiresAt` is a column, and a refresh is always a query. That is the trade
ADR-0008 already made for revocation, not a new cost.

A token is recoverable from its hash only by holding the token, so a Viewer who has lost
their cookie has no session to recover — they log in again, which is the intended
behaviour and not an incident.

If SHA-256 ever needs replacing, the stored digests cannot be migrated in place: the
tokens they came from are not held anywhere. Every family would be revoked and every
Viewer would log in again, which is an acceptable one-off for a credential that already
rotates on every use.
