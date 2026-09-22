# Interview question bank

A shared bank of interview and screening questions, searchable across Categories, where
Questions tied to a Client stay visible only to Viewers holding a Permission Grant for
that Client. The vocabulary is defined in [CONTEXT.md](CONTEXT.md); the decisions behind
the build are in [docs/adr](docs/adr).

This is the thinnest version that runs end to end, plus its sign-in front door. It comes up, answers
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
one to send traffic on.

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

The authentication endpoints are rate limited per caller address, each with its own
allowance, and only failed attempts count, so an ordinary Viewer signing in repeatedly
is never locked out of their own account
(ADR-0021). Behind a proxy, `TRUST_PROXY_HOPS` has to match how many there are, or the
limit keys on the proxy rather than on the caller.

Every `/api` path except `POST /api/auth/login`, `POST /api/auth/refresh` and
`POST /api/auth/logout` sits behind the sign-in check, including paths that do not
exist: a caller who is not signed in is told 401 everywhere alike, so nobody can map out
the API by probing for which paths answer 404. Access tokens are short-lived and
belong in memory, never in storage (ADR-0008); `ACCESS_TOKEN_LIFETIME_SECONDS` sets how
short.

Logging in also sets a refresh token as an httpOnly, Secure, SameSite cookie limited to
`/api/auth`. `POST /api/auth/refresh` exchanges it for a fresh access token and a new
refresh token, and presenting one that has already been spent revokes every session
descended from that login (ADR-0008, ADR-0023). `POST /api/auth/logout` ends the current
one. `REFRESH_TOKEN_LIFETIME_SECONDS` sets how long a session survives being away, and
`REFRESH_COOKIE_SECURE` is false only where the API is served over http.

```sh
# The cookie jar is what a browser would keep for you.
curl -s -c jar -o /dev/null localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"author@iqb.test","password":"author-password"}'

curl -s -b jar -c jar -X POST localhost:3000/api/auth/refresh | jq -r .accessToken
curl -s -b jar -X POST -o /dev/null -w '%{http_code}\n' localhost:3000/api/auth/logout  # 204
```

## A bank big enough to time a query against

`pnpm db:seed` writes seven Questions across two Clients. That is enough to read and not
enough to time a query against, so `pnpm db:seed:bulk` writes a big bank beside them:

```sh
pnpm db:seed:bulk            # 10,000 Questions
pnpm db:seed:bulk 50000      # as many as you ask for
pnpm db:seed:bulk 10000 mine # ...from a seed value of your own
```

Everything about the bank comes from that seed value rather than from chance: which Tags
a Question carries, whether it is restricted to the first Client, its Publication State, when
it was created. So the same value writes the same bank every time, and you can compare
one timing against another. Ask for fewer Questions and you get part of that same bank,
not a squeezed copy of it.

Some Tags are carried by a third of the bank and some by one Question in fifty, on
purpose. ADR-0011 chose between two SQL shapes by timing them, and the answer turned on
how much of the bank a filter matches. A bank where every Tag matches about as much as
every other cannot show that.

`pnpm db:seed` never runs this, so it stays short enough to read.

## Near-duplicate detection

A Question submitted to the bank is measured against the Questions already in it, and a
close match is answered at submission time rather than stored quietly:

```sh
curl -s -X POST localhost:3000/api/questions \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d '{"text":"Explain the difference between an interface and a type in TypeScript.",
       "answerNotes":"...","provenance":"original"}'
# 409, with the closest few Near-Duplicates in error.details
```

If that is wrong, say so and submit it again. That stores the Question, and records
the decision against the Author who made it:

```sh
# ...the same body, plus:
#   "confirmedNotANearDuplicate": true
```

**What is compared.** Question text alone, never the Answer Notes. Similarity counts the
characters two strings share, so measuring a one-line Question against a paragraph of
Notes scores near zero however plainly one is a copy of the other (ADR-0004).

**What is compared against.** The Questions the submitting Viewer can already read, and
only the Published ones. A check across the whole bank would answer a submission with
"this closely duplicates an existing Question" when the match is restricted to a Client
the submitter holds no Permission Grant for, which tells them that Question exists
(ADR-0007). Published only, so nobody learns about a Question sitting in a review queue
they cannot see either (ADR-0014). The cost is real and accepted: the bank can hold
genuine duplicates on opposite sides of a visibility boundary.

**The threshold is 0.45**, on the zero-to-one scale `pg_trgm` measures similarity on.
Trigram similarity ignores word order and punctuation, so it is measuring the words two
Questions share. Measured against this bank and rewordings of it:

| Pair | Similarity |
| --- | --- |
| The same Question, a trailing clause added | 0.87 |
| The same Question, one word swapped | 0.87 |
| The same Question, reworded | 0.78 |
| The same Question, reworded heavily | 0.56 |
| Different Questions sharing their opening words | 0.40 |
| Different Questions on the same subject | 0.28 |
| Unrelated Questions | 0.06 |

Every genuine Near-Duplicate scores 0.56 or above and nothing that is not one reaches 0.40, so
0.45 sits in the gap with room either side. `pg_trgm`'s own default of 0.3 is inside the
noise for text this long and would refuse honest submissions. The number is
`nearDuplicateThreshold` in `shared/src/questions.ts`; change it there and the measurements
above are what to re-run.

**Both outcomes leave a trace.** A refusal is recorded as a Change Event naming no
Question — nothing was stored — and carrying the whole attempt, which is why the history
is an event log rather than versions of a row (ADR-0006). An override is recorded against
the Question it stored, in the same transaction, so the Question and the record of the
call it took cannot exist apart.

Both of those events name Near-Duplicates, which are Questions in their own right, so only
the Viewer an event names may read it. Somebody else reading the same Question's history
does not see the event at all — its presence alone would say a Question they cannot reach
exists (ADR-0028).

Detection runs at submission today. Publication and text edits are the other two moments
it belongs at, and they arrive with their own ticket (ADR-0014).

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
backed by the test database, with truncation between tests. That is the level every
later ticket tests at: the guarantee this project is built around, that a
Client-restricted Question is indistinguishable from one that does not exist, is a
property of an HTTP response and cannot be asserted below it.

## The workspace

```
shared/     zod schemas for every request and response shape (ADR-0010)
backend/    the Express API (ADR-0001)
frontend/   the Vite and React client
```

Both ends infer their types from the schemas in `shared`, so a shape cannot get out of
sync between client and server. The client is a placeholder that reads the API's readiness
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
machine and run `pnpm db:seed` there. It is safe to run twice and leaves an existing
Viewer untouched, so it can be re-run without resetting a password someone changed.

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
stops each endpoint answering differently as the API grows.

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

**No way in without signing in.** The sign-in check is mounted on the `/api` router in
front of everything but login, rather than on each endpoint, so a route added later is
protected by where it was added rather than by someone remembering to protect it. The
check reads the Viewer from the database on every request instead of trusting the token's
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
