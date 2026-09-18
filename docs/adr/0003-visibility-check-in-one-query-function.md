# Check visibility in one query function, not Postgres RLS

Row-Level Security is the obvious way to make a visibility rule impossible to bypass, so turning it
down needs recording.

PostgreSQL will not use an index scan on a table carrying RLS policies when an operator in the
`WHERE` clause has an underlying function that is not marked `LEAKPROOF`
(postgresql.org/docs/current/rules-privileges.html). The full-text operator `tsvector @@ tsquery`
comes down to `ts_match_vq`, which carries no `proleakproof` flag in `pg_proc.dat`. Turning RLS on
for the questions table therefore costs the GIN index on exactly the keyword search that has to
stay fast at several thousand rows.

Instead, every Question read goes through one function that always adds the permission condition;
filtering and search build on top of it.

## Consequences

- The guarantee comes from how the code is arranged, not from the database. The repository module
  holding that function must stay the only way to reach the questions table — if a second way
  appears, the guarantee is gone.
- **Adding RLS later as a second layer is not free.** It would make the search plan worse on the
  day it is switched on. Treat the two approaches as either/or.
- A second reason: Prisma may use a different pooled connection per query, so an RLS setup would
  also need every request wrapped in an interactive transaction to keep the viewer setting on one
  connection.
- Prisma Migrate makes the application user the table owner, so an RLS build would also need
  `FORCE ROW LEVEL SECURITY` or the policies would silently do nothing — a quiet way to ship a POC
  whose headline guarantee does not hold.

Evidence and citations: `docs/research/rls-vs-one-query-function.md`.
