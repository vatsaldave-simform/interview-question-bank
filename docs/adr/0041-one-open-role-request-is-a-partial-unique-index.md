# One open Role Request per Viewer is a partial unique index

A Viewer holds at most one open Role Request (ADR-0016). The spec asks for the rule to be kept by
the database, not by reading first and then writing. A read-then-write lets two requests sent at
the same moment both look, both see nothing open, and both insert.

**`role_requests` has a unique index on `viewerId` that covers only the rows whose `state` is
`open`.** A Viewer may have any number of granted and denied Role Requests, and one open one. A
second open insert fails with PostgreSQL's unique violation, which Prisma raises as `P2002`. The
service turns that into a 409, the way a duplicate Permission Grant or a Viewer's address already
in use is caught. Nothing is checked before the insert.

**Deciding frees the Viewer to ask again.** The index is on the open rows only, so once a Role
Request is granted or denied, it no longer counts, and the next insert goes in. Nothing is
deleted (ADR-0017).

**The index is declared in `schema.prisma`, through Prisma's `partialIndexes` preview feature.**
Prisma added it in 7.4, and we pin 7.10 (ADR-0005). An index made only in a migration is one
Prisma does not know about, and the next `migrate dev` would write a migration that drops it.
`search-column.test.ts` already fails when the migrations and the schema are out of sync, so it
catches that too.

## What we did not do

**An `openRoleRequestId` column on the Viewer.** A nullable unique pointer from the Viewer to their
open request would also allow only one. But it is a second thing to keep in step with the
request's own state, and deciding a request would have to write two tables to stay right.

**A lock on the Viewer's row, then a check.** It works, as ADR-0039 does for the
last-Administrator rule. But that rule is a count across many rows, which no index can hold. This
one is uniqueness, which an index holds without anyone having to remember to take a lock.

## Consequences

The preview flag is in the generator block. If a later Prisma makes partial indexes stable, the
flag becomes a warning to remove. If one drops the feature, the schema stops validating, which is
loud rather than quiet.
