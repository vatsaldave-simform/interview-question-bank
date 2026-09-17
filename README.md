# Interview question bank

A shared bank of interview and screening questions, searchable across Categories, where
Questions tied to a Client stay visible only to Viewers holding a Permission Grant for
that Client. The vocabulary is defined in [CONTEXT.md](CONTEXT.md); the decisions behind
the build are in [docs/adr](docs/adr).

This is the walking skeleton plus its authenticated front door. It comes up, answers
health checks, logs every line of a request against that request's id, shuts down
cleanly, runs a test suite against a real PostgreSQL, and refuses every `/api` request
that does not carry a valid access token. The bank itself arrives in the tickets that
follow.

## Getting started

```sh
cp .env.example .env
docker compose up
```

That builds the API and the client, starts PostgreSQL, applies migrations through a
one-shot `migrate` service that the API waits on, and serves both from
`http://localhost:3000`. Nothing else is needed. Use `up --build` after writing a
migration, since the `migrate` service takes them from the image.

```sh
curl localhost:3000/health   # {"status":"ok"}
curl localhost:3000/ready    # {"status":"ready","checks":{"database":"up"}}
```

`/health` is liveness and never touches the database, so a blinking database does not
get the container restarted. `/ready` reports whether the database answers, and is the
one to gate traffic on.

## Signing in

There is no registration endpoint — an Administrator creates Viewers (ADR-0016) — so an
empty database has nobody who can log in. `docker compose up` seeds one Viewer per role
on its way up, in a one-shot `seed` service the API waits for; running the API outside
compose, `pnpm db:seed` does the same thing:

| Address             | Password            | Role     |
| ------------------- | ------------------- | -------- |
| `reader@iqb.test`   | `reader-password`   | Reader   |
| `author@iqb.test`   | `author-password`   | Author   |
| `reviewer@iqb.test` | `reviewer-password` | Reviewer |

They are development data, and the seed leaves an existing Viewer alone, so running it
twice will not reset a password.

```sh
TOKEN=$(curl -s localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"author@iqb.test","password":"author-password"}' | jq -r .accessToken)

curl -s localhost:3000/api/auth/me -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/auth/me   # 401
```

Logging in is rate limited per caller address, and only failed attempts count, so an
ordinary Viewer signing in repeatedly is never locked out of their own account
(ADR-0021). Behind a proxy, `TRUST_PROXY_HOPS` has to match how many there are, or the
limit keys on the proxy rather than on the caller.

Every `/api` path except `POST /api/auth/login` sits behind the authentication gate,
including paths that do not exist: an anonymous caller is told 401 everywhere alike, so
the shape of the API cannot be mapped by probing for which paths answer 404. Access
tokens are short-lived and belong in memory, never in storage (ADR-0008);
`ACCESS_TOKEN_LIFETIME_SECONDS` sets how short. Refresh tokens arrive in the next
ticket, so a token currently expires with no way back but logging in again.

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
which serves it on port 5173 and proxies the API's paths through without rewriting them.

Application routes live under `/api`. `/health` and `/ready` deliberately do not: they
answer the platform rather than the application, and the deployed health check asks for
`/health` at the root. The dev server proxies all three, so a path means the same thing
in development as it does in the deployed image.

## Deployment

**Deployed at:** <https://interview-question-bank.onrender.com>

One free Render web service serves the API and the built client from a single origin,
against a free Neon Postgres. There is no CORS and no second host. The decision, and
what was rejected to reach it, is [ADR-0012](docs/adr/0012-deploy-to-render-and-neon.md);
`render.yaml` is the whole platform configuration.

**It sleeps.** Render spins the free service down after fifteen minutes without traffic
and takes about a minute to wake. Say so when you share the link — a minute of Render's
loading page reads as broken to someone who wasn't told. Nothing pings it to keep it
warm: the 750 free instance-hours are granted per workspace against a 744-hour month, so
staying awake would exhaust the allowance before the month ended.

**Deploys come from CI, not from pushes.** Render's auto-deploy is off. A push to `main`
runs typecheck, build and the suite; only then does the workflow apply migrations to Neon
and call Render's deploy hook. Two repository secrets make that work:

| Secret | Value |
| --- | --- |
| `DATABASE_URL` | Neon's **direct** (unpooled) connection string |
| `RENDER_DEPLOY_HOOK_URL` | From the service's Settings page on Render |

Migrations are applied before the new image is deployed, so a migration has to be
compatible with the version still running for the few seconds in between. Render's
pre-deploy command, where this would otherwise belong, is paid-only.

The server image runs `node dist/index.js` and nothing else — it carries no Prisma CLI.
Applying a migration is something a deployment does, not something a server does on its
way up. Locally that job belongs to a one-shot `migrate` compose service, built from the
image's own `builder` stage, which runs to completion before the API starts; so
`docker compose up` still needs no manual step, and a failed migration stops the API
rather than crash-looping it.

**Writing a migration means `docker compose up --build`.** The `migrate` service gets its
migrations from the image, so a plain `up` will quietly apply the previous set.

**Seeding is local.** Free Render services have no shell, no SSH and no one-off jobs, so
there is no in-platform way to run the seed. Point `DATABASE_URL` at Neon from your own
machine and run `pnpm db:seed` there. It is idempotent and leaves an existing Viewer
untouched, so it can be re-run without resetting a password someone changed.

`ACCESS_TOKEN_SECRET` is the one secret Render holds that is not in the table above:
`render.yaml` asks the platform to generate it, so it is never in git and never typed by
anyone. Rotating it in the dashboard signs everyone out, which is the point of tokens
being short-lived rather than sessions being long.

The hosted bank holds seed data and throwaway test Questions, which is what makes
publishing its demo credentials safe. Putting real Client-restricted Questions into it
would invalidate that, and the free tier has no backups.

## What the skeleton carries

**One error contract, enforced in one place.** Route handlers raise domain errors and
never set a status code for one. The mapping from error code to status code lives in
`backend/src/platform/http/error-handler.middleware.ts` and nowhere else, which is what
keeps the contract from drifting per endpoint as the API grows.

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

**No anonymous path.** The authentication gate is mounted on the `/api` router in front
of everything but login, rather than on each endpoint, so a route added later is
protected by where it was added rather than by someone remembering to protect it. The
gate reads the Viewer from the database on every request instead of trusting the token's
contents, which is what will let a role change or a deactivation take effect on the next
request rather than when a token happens to expire. Every refusal is the same 401 with
the same body; why it was refused — absent, malformed, expired, forged — goes to the log
instead, where an operator can read it and a caller cannot.

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

`backend/prisma/schema.prisma` holds the `viewers` table and nothing else yet; the
Question tables arrive with the tickets that own that vocabulary. The test harness reads
the table list at truncation time rather than keeping its own copy, so those tables are
cleaned between tests without anyone updating the harness.
