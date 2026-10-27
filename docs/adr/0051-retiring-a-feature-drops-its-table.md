# Retiring a feature drops its table

Once a Client hides nothing (ADR-0050), a Permission Grant authorises nothing. **The
`permission_grants` table is dropped, with its routes and its screens.** That looks like it
breaks ADR-0017, which says nothing is deleted. It does not.

## Why this does not break ADR-0017

**ADR-0017 is about Clients and Viewers.** Deleting either one would orphan what points at it:
Questions, authorship and Change Events. Nothing points at a Permission Grant.

**A Grant row was never kept for history.** Revoking a Grant has always deleted its row. The
`permission_grant_issued` and `permission_grant_revoked` events are the record of who held what
and when. Those events stay, and their values stay in the enum, because the log is append-only
(ADR-0027). Dropping the table loses only the list of Grants held today, and today they mean
nothing.

## What we did not do

**Keep the table but stop using it, in case restriction comes back.** A table nothing reads still
has to be carried through every migration, and every reader has to learn that it is dead. If
restriction ever comes back, it will need a fresh design, and the events show who held what.

## Consequences

- The table is dropped last, after no running code reads it. Its migration comes after the code
  that stopped reading it has shipped.
- The old Grant events still name a Client and a Viewer. Both still exist, because neither is
  ever deleted.
