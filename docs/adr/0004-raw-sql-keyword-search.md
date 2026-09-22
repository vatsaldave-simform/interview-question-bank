# Keyword search is hand-written SQL, not Prisma's `search` filter

Prisma's `search` filter on PostgreSQL emits `to_tsvector(concat_ws(' ', "a","b")) @@ to_tsquery($1)`.
That is the *one-argument* `to_tsvector`, which cannot use a two-argument expression index, and
the *strict* `to_tsquery`, which raises a syntax error on ordinary user input such as `c++`. It
would be a per-row sequential recompute — the "fetch broadly, discard in code" shape this POC
exists to avoid — with stemming that varies by server configuration.

We store a generated `tsvector` column over Question text and Answer Notes, index it with GIN,
and query it with `websearch_to_tsquery` through `$queryRaw`.

## Consequences

- The `tsvector` column is declared `Unsupported("tsvector")?` in `schema.prisma`. It must be
  **optional**: a required `Unsupported` field removes `create`/`update`/`upsert` from the client.
- Declaring it is not enough on its own, which the research left open and building it settled.
  Prisma reads a stored generated column back as a column **default**, so a schema that
  declares the column but not the expression still differs from the migration history, and the
  next `migrate dev` writes an `ALTER` that takes the generated-ness away. The expression has to
  be repeated in `@default(dbgenerated(...))`, spelled the way PostgreSQL reads it back
  (`'english'::regconfig`, `COALESCE`, the added brackets). `backend/tests/search-column.test.ts`
  runs the same comparison `migrate dev` runs and fails if the two ever disagree.
- Near-duplicate detection is a *different* problem and gets a different mechanism
  (`pg_trgm` over Question text alone, GiST-indexed for the KNN ordering case). Using one
  mechanism for both would serve neither.

Evidence and citations: `docs/research/postgres-text-search.md`.
