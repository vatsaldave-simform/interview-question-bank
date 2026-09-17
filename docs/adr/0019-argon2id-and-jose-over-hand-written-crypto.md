# Argon2id for passwords, jose for access tokens — neither written here

Two pieces of cryptography arrive with the login endpoint: hashing a Viewer's password,
and signing the short-lived access token ADR-0008 describes. Both are available from
node's own `crypto` module — `scrypt` and an HMAC are a couple of dozen lines each — and
both are taken from a library instead.

**Passwords: `@node-rs/argon2`.** Argon2id at the library's defaults, which are the
OWASP-recommended parameters, and which are written into every stored hash so that
raising them later leaves existing credentials verifiable rather than locking their
owners out. It is chosen over `bcrypt` and `argon2`, which are node-gyp modules with no
musl prebuilds and would put a C toolchain in the alpine builder stage; `@node-rs/argon2`
ships a prebuilt `linux-x64-musl` binary, so the image is unchanged. `bcryptjs` is pure
JavaScript and needs nothing, but it is slower per unit of resistance and truncates
silently past 72 bytes.

**Access tokens: `jose`.** The token is a JWS, and the dangerous half of a JWS is the
verifier, not the signer: algorithm confusion, a signature compared without constant
time, `none` accepted because the header said so, a payload read before the signature
over it has held. `jose` gets those right, is audited, and pins the accepted algorithms
by parameter — `jwtVerify(token, key, { algorithms: ["HS256"] })` — rather than by
trusting what the token's own header claims.

The rejected alternative in both cases was `node:crypto` directly. The primitives there
are fine — OpenSSL's, not ours. What would have been ours is the part around them: the
encoding of the stored hash, the parsing of it back, the expiry comparison, the
constant-time compare, the refusal to dispatch on an attacker-supplied algorithm name.
That is the code this decision declines to own.

## Consequences

`@node-rs/argon2` is a native module, so the platform-specific package has to resolve
inside the image as well as on a laptop. `pnpm install --frozen-lockfile` in the alpine
builder resolves the musl build from the lockfile's optional entries, and `pnpm deploy`
carries it into the runtime stage; a platform without a prebuild would need a Rust
toolchain rather than falling back to JavaScript, which is the cost of the choice.

Hashing is deliberately expensive, so the suite pays for it: seeding three Viewers costs
roughly a tenth of a second. Test files seed once in `beforeAll` rather than per test.
