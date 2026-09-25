# Neither Clients nor Viewers are ever deleted

Deleting a Client does one of two things to the Questions restricted to it. It orphans them,
leaving a restriction that points at nothing — which resolves to no restriction at all and
**declassifies confidential material across the whole bank**, the worst failure this system has.
Or it cascades and destroys the content. Neither belongs behind an endpoint.

Deleting a Viewer orphans their authorship and their Change Events, and the log is append-only
precisely so that provenance is never lost.

So neither is deletable. A Viewer is **Deactivated** instead: they cannot log in, their refresh
token family is revoked immediately so that an open session dies when its short-lived access token
expires rather than surviving on rotation (ADR-0008), and they remain the Author of everything they
wrote. The sign-in check goes further and refuses them on their very next request, because it reads
the Viewer on every request anyway, the way a revoked Grant takes effect at once. Their Permission
Grants stay attached, because a Grant is a separate fact from whether someone may log in, and
reactivation should restore what was there rather than leave access to be reconstructed from
memory. An Administrator who wants those Grants gone revokes them explicitly.

## Consequences

The Client list only grows. If it becomes unwieldy, an Archived flag that hides a Client from
pickers while leaving every existing Grant and restriction working is purely additive — it is not
built now.
