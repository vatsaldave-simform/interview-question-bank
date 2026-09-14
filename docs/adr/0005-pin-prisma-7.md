# Pin Prisma to exact 7.x

The `prisma` CLI currently publishes its npm `latest` tag to an `8.0.0` release candidate, while
`@prisma/client` publishes `latest` to `7.10.0`. A default `npm i prisma @prisma/client` therefore
installs a mismatched pair: a v8 release-candidate CLI driving a v7 client.

Prisma 8 also reportedly removes `Prisma.sql`, `Prisma.join`, `Prisma.raw` and TypedSQL, which
ADR-0004 depends on, and lists `$extends` as unavailable.

Both packages are pinned to exact 7.x versions, no caret.

## Consequences

Do not "update to latest" to satisfy a dependency audit without re-reading ADR-0004 first. The
version carrying Prisma's new first-party RLS authoring is the same one that removes the raw-SQL
escape hatch this design relies on.
