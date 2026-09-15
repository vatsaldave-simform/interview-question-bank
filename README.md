# Interview question bank

A shared bank of interview and screening questions, searchable across Categories, where
Questions tied to a Client stay visible only to Viewers holding a Permission Grant for
that Client. The vocabulary is defined in [CONTEXT.md](CONTEXT.md); the decisions behind
the build are in [docs/adr](docs/adr).

This is the walking skeleton. It comes up, answers health checks, logs every line of a
request against that request's id, shuts down cleanly, and runs a test suite against a
real PostgreSQL. The bank itself arrives in the tickets that follow.

## Getting started

```sh
cp .env.example .env
docker compose up
```

That builds the API, starts PostgreSQL, applies migrations, and serves on
`http://localhost:3000`. Nothing else is needed.

```sh
curl localhost:3000/health   # {"status":"ok"}
curl localhost:3000/ready    # {"status":"ready","checks":{"database":"up"}}
```

`/health` is liveness and never touches the database, so a blinking database does not
get the container restarted. `/ready` reports whether the database answers, and is the
one to gate traffic on.

## Running the tests

The suite talks to a separate database service, so it never touches development data.

```sh
cp .env.test.example .env.test
docker compose up -d db-test
pnpm install
pnpm test
```

The suite refuses to start unless the database's name contains `test`, because every
test truncates it.

Tests issue real HTTP requests against the real application on an ephemeral port,
backed by the test database, with truncation between tests. That is the seam every
later ticket tests at: the guarantee this project is built around, that a
Client-restricted Question is indistinguishable from one that does not exist, is a
property of an HTTP response and cannot be asserted below it.

## The workspace

```
shared/     zod schemas for every request and response shape (ADR-0010)
backend/    the Express API (ADR-0001)
frontend/   the Vite and React client
```

Both ends infer their types from the schemas in `shared`, so a shape cannot drift
between client and server. The client is a placeholder that reads the API's readiness
through those schemas; its shell arrives with the login ticket. Run it with `pnpm dev`,
which serves it on port 5173 and proxies `/api` to the API.

## What the skeleton carries

**One error contract, enforced in one place.** Route handlers raise domain errors and
never set a status code for one. The mapping from error code to status code lives in
`backend/src/http/error-handler.ts` and nowhere else, which is what keeps the contract
from drifting per endpoint as the API grows.

Error responses carry the request id in the `x-request-id` header, deliberately not in
the body. Two responses that have to be indistinguishable to a caller cannot carry
anything that varies per request, and that rule is easier to keep if the body has no
room for it at all.

Readiness is the one place a route decides a failure status, because the 503 is part
of the report rather than an error. It goes through a named table next to the route so
that it reads as the exception it is.

**A request id on every log line.** The id is taken from an incoming `x-request-id`
header when it is short and printable, and generated otherwise. It travels in an
`AsyncLocalStorage` context, so code deep in a call stack logs against the right
request without a logger being threaded through every function.

**Graceful shutdown.** SIGTERM stops the listener, closes idle keep-alive sockets,
waits out in-flight requests up to `SHUTDOWN_TIMEOUT_MS`, then closes the database pool.

## Prisma is pinned to exact 7.x

`prisma` and `@prisma/client` are pinned to `7.10.0` with no caret, and should stay that
way. The `prisma` CLI publishes its npm `latest` tag to an 8.0.0 release candidate while
`@prisma/client` publishes `latest` to 7.10.0, so a plain `npm i prisma @prisma/client`
installs a v8 release-candidate CLI driving a v7 client. The CLI prints an "update
available" banner on every run for the same reason; ignore it.

Prisma 8 also removes the raw-SQL escape hatch that keyword search depends on, so
updating is not a dependency bump. Read ADR-0004 and ADR-0005 before changing either
version.

## Where the database schema is

`backend/prisma/schema.prisma` has a datasource and a generator and no models yet. The
first tables arrive with the Viewer and Question tickets, which own that vocabulary. The
test harness reads the table list at truncation time rather than keeping its own copy,
so those tables are cleaned between tests without anyone updating the harness.
