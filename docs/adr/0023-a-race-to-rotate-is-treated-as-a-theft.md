# A race to rotate is treated as a theft, and the family dies

Reuse detection cannot tell a stolen token from an honest one. Both are a second
presentation of a token that has already been spent, and the database holds nothing that
distinguishes the attacker's request from the Viewer's second browser tab. This decision
records which way that ambiguity is resolved, because it is resolved against the honest
Viewer.

**A second presentation ends the family, whoever made it.** Two tabs refreshing at the
same instant, or a client that retries a request whose response it never saw, will log
that Viewer out of every session descended from their login. They log in again. The
alternative — forgiving a reuse that arrives soon enough, or from the same address — is
an attacker's instruction manual: the theft is made to look like the honest case, which
is the one thing the attacker fully controls.

**The order of the checks in `rotateRefreshToken` is part of the decision.** Revoked
first, then spent, then expired. A token that is both spent and expired is answered as a
reuse rather than as an expiry, because an expiry is forgiven and a reuse is not: taking
them the other way round would let a thief launder a stolen token by waiting for it to
expire before presenting it, and the family would survive.

**A rotation that loses the race to spend is a reuse too.** `spendRefreshToken` is a
compare-and-swap, so of two requests holding the same token exactly one can proceed. The
loser has, by definition, presented a token someone else had already spent, which is the
same fact as the sequential case arriving a moment later.

**The successor is checked after it is inserted.** The losing request revokes the family
while the winning one is still inserting its successor, and a revocation cannot reach a
row that does not exist yet — so the winner re-reads the family after inserting, and
treats a revocation that appeared underneath it as its own refusal. Without that step the
one token that survives a detected theft is the attacker's, which inverts the whole
mechanism.

## Consequences

An ordinary Viewer can be logged out by their own client misbehaving, and the client is
what has to avoid it: one refresh in flight at a time, shared across tabs. That is a
constraint on the client ticket, not a defect in this one.

Every rotation costs one extra query — the check that the family is still alive — on the
request a Viewer is waiting on. It is an indexed count on `familyId` against a handful
of rows, and it is the price of the guarantee in the paragraph above.

The window it closes is narrow and needs two requests interleaved within it, so it
cannot be reproduced reliably by a test. The suite asserts the rule that must always
hold instead: after two concurrent rotations, no live token remains in the family.
