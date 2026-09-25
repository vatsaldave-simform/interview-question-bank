# Login is limited by caller address, counting only failures

The login endpoint is where an unauthenticated caller may guess, as fast as argon2 can answer, at
credentials the brief expects to be sprayed at it. `express-rate-limit` counts attempts per caller
address, in this process rather than in a cache (ADR-0009), and the refusal is raised as the
error contract's `rate_limited` rather than answered by the limiter's own responder — so the 429
and its body come from the one middleware that decides every other status.

**The limit is on the login route, not on the router the route sits in.** A request for a path
behind the sign-in check passes through the public router first on its way to being refused, so a
limit mounted a level up would let a caller spend an address's login allowance by hammering an
endpoint that never checks a password.

**Only failures count.** A successful login does not spend the allowance. Counting successes
would punish the ordinary case this system actually has — several colleagues behind one office
address, signing in each morning — to slow an attacker who, by definition, is failing.

**Per-account limiting was rejected.** Locking a named Viewer after N failures stops a targeted
guess against one account, but it hands out two things this project has spent its design refusing:
a way to find out an address has an account, since "your account is locked" differs from "those
credentials are not valid"; and a denial-of-service against any Viewer whose address an
attacker knows. Address-based limiting has neither property, and credential stuffing — many
addresses from few sources — is the attack the brief names.

**The limit is only as good as `req.ip`.** Behind a proxy, Express reports the proxy's address
unless it is told how many hops to trust, which would put every caller in one bucket and let the
first attacker lock out everyone. Trusting every hop is worse: `X-Forwarded-For` is caller-supplied,
so a caller could invent an address per request and never be limited at all. `TRUST_PROXY_HOPS` is
therefore a count, zero locally and one on Render, and has to match the real depth.

**Refresh and logout joined the limit in #4, on the same terms.** They are unauthenticated
for the same reason login is — a caller reaching them has no access token yet — so a limit
on login alone would have left the two endpoints beside it free to be hammered. Each route
carries its own limiter and so its own allowance, which is the rule above applied rather
than bent: a caller who has spent the login allowance can still recover the session they
already hold. The environment variables keep their `LOGIN_RATE_LIMIT_` names, because
renaming what a deployment already sets is a change to the deployment, not to this
decision.

**Set-password joined the limit in #26, on the same terms.** Whoever follows a mailed link has
no access token either, so the endpoint is unauthenticated like login. Unlimited, it would let a
caller guess at tokens, and make the password hasher run on every guess, as fast as the API
answered. It carries its own limiter and so its own allowance, and only failures count: a dead
link spends it, and setting a password does not.

**The password reset request joined the limit in #28, and it counts every request.** It is
unauthenticated like the others. But it answers 202 to every well-formed request, whether or not
the address has an account (ADR-0038), so it never fails, and a limit that counted only failures
could never be reached. Unlimited, it would let a caller have a Viewer mailed without end. So this
one route counts successes too. That does not bring back the office problem above: nobody asks
for a reset every morning, and a shared address that asks often enough to be refused can wait
out the window. It has its own allowance, like every other route, and the same
`LOGIN_RATE_LIMIT_` values.

## Consequences

The window and the threshold are environment configuration, so the suite sets them low rather than
waiting out a real one. Limits live in this process's memory, so a restart forgives every attacker
mid-window and a second instance would double every allowance — both acceptable while the service
runs as one instance, and both reasons this has to be revisited before it runs as two.

A shared outbound address is a shared allowance: an office that fails enough logins in a window
locks out its own next attempt, correct password included. The threshold is set with room for
that, and the failing-only rule is what keeps the ordinary day from reaching it.

Logout is limited nominally rather than effectively: it answers 204 whatever it is
given, and only failures count, so its allowance can never be spent. The limiter is
mounted there so that an endpoint is never the exception nobody noticed, not because it
holds anything back today.

Exempting successes leaves one thing unlimited: a caller who holds a valid credential can spend the
hasher as fast as it will answer. That is a caller who is already in, so it buys them nothing they
did not have, and a ceiling on requests regardless of outcome is the answer if it ever matters.
