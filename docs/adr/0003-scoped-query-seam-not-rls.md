# Enforce visibility in a scoped query seam, not Postgres RLS

Row-Level Security is the obvious way to make a visibility rule unbypassable, so its rejection
needs recording.

PostgreSQL will not select an index scan on a table carrying RLS policies when an operator in
the `WHERE` clause has an underlying function that is not marked `LEAKPROOF`
(postgresql.org/docs/current/rules-privileges.html). The full-text operator `tsvector @@ tsquery`
resolves to `ts_match_vq`, which carries no `proleakproof` flag in `pg_proc.dat`. Enabling RLS on
the questions table therefore costs the GIN index on exactly the keyword search that has to stay
usable at several thousand rows.

Instead, all Question reads go through a single scoped query builder that always carries the
permission predicate; filtering and search compose on top of it.

## Consequences

- The guarantee is structural, not database-enforced. The repository module owning that builder
  must remain the only importable path to the questions table — if a second path appears, the
  guarantee is gone.
- **Adding RLS later as defence-in-depth is not additive.** It would degrade the search plan on
  the day it is switched on. Treat the two approaches as mutually exclusive.
- A secondary reason: Prisma may use a different pooled connection per query, so an RLS setup
  would additionally require wrapping every request in an interactive transaction to pin the
  viewer setting to a connection.
- Prisma Migrate makes the application user the table owner, so an RLS build would also need
  `FORCE ROW LEVEL SECURITY` or the policies would silently no-op — a quiet way to ship a POC
  whose headline guarantee does not hold.

Evidence and citations: `docs/research/rls-vs-scoped-query.md`.
