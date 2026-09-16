# Administration is an authority beside the roles, not above them

Reader, Author and Reviewer form a ladder about Questions: what a Viewer may read, add and edit.
Administering access asks a different question — who may see a Client's material, who holds which
role, who may log in at all — and putting it at the top of that ladder would make the person you
trust to fix a typo the person who hands out client access.

Administrator is therefore a flag held alongside one of the three roles rather than a fourth value
replacing them, and it carries no access to Questions. An Administrator sees exactly what their
Permission Grants allow, like anyone else.

An Administrator may grant themselves access to a Client, appoint another Administrator, or give
themselves the Reviewer role. That is deliberate. The guarantee is not that administration cannot
escalate — any administration useful enough to keep can — but that escalation cannot happen
quietly: each of those acts lands in the Change Event log under the name of the Viewer who
performed it. Requiring a second Administrator to approve each act buys a check that stalls the
moment one person is away, which is the reasoning that settled self-publication in ADR-0013.

One invariant is enforced: the last Administrator cannot be removed. Running with a single
Administrator is sensible; a system that *enforces* a maximum of one is not, because the failure
it creates — the sole Administrator leaves, and appointing a replacement is an Administrator-only
act — has no recovery path inside the system.

## Consequences

An Administrator who is also a Reader cannot read Client-restricted Questions. They have to issue
themselves a Permission Grant first, in the open, where the log records it.
