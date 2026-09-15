# The deployed bank is one Render service on Neon Postgres, served from one origin

The bank has to be reachable at a URL that can be shared with a department, at no cost, and it
deploys from the walking skeleton rather than after the last ticket. A skeleton that has only ever
run on `localhost` has proven half of what it claims; the point of building one is that it walks
all the way to production, so the platform's problems arrive while the surface area is three
endpoints instead of alongside an app that is also being debugged.

**The API and the client are one Render web service on the free instance type, backed by a free
Neon Postgres, served from a single origin.** The free tiers that had reputations for this — Fly
and Railway — no longer have one; Fly's ended in October 2024 and Railway's trial credit lapses to
a dollar a month. Render's free web service and Neon's free plan both persist indefinitely and
neither asks for a card. Render's own free Postgres is expressly not used: it is deleted thirty
days after creation, which is disqualifying for a link meant to be shared.

## One origin, and what it buys

Express serves the built React bundle. Application routes mount under `/api`; `/health` and
`/ready` stay at the root as a named exception, because they are the contract with the platform
rather than part of the application. The SPA fallback sits behind that exception so that
`notFoundHandler` keeps owning the error contract and a mistyped API path cannot return
`index.html` with a 200.

The alternative — the client on a CDN, the API elsewhere — was rejected on two grounds. It forces
the ADR-0008 refresh cookie to `SameSite=None`, which is a real weakening of a recorded decision
rather than a configuration detail; **under one origin ADR-0008 is untouched and the cookie stays
`SameSite=Lax`**. And it makes the cold start worse in the way that matters: a CDN-served shell
paints instantly and then hangs for a minute on a sleeping API, which reads as broken, where one
origin is slow once and then works, which reads as slow.

The deployed client's API origin was deferred to the client shell ticket in `vite.config.ts`. It is
answered here instead, ahead of that ticket: same origin, `/api` prefix, no CORS. The dev server's
`/api` rewrite is removed so that a URL means the same thing in development and production.

## Cold start is accepted, not worked around

A free Render service spins down after fifteen minutes without inbound traffic and takes about a
minute to wake, behind a Render loading page. This is disclosed — on the login screen and in the
message that carries the link — rather than defeated. A keep-warm pinger would consume very nearly
the whole allowance, because the 750 free instance-hours are granted **per workspace** and a month
is 744 hours; the service would be dead before month end. Whether a configured health check path
also defeats the sleep is undocumented by Render either way, and is not relied on in either
direction.

Neon's compute suspends far more aggressively, at five minutes, and cannot be told not to on the
free plan. It does not matter: Neon resumes in under a second, against Render's minute. Application
cold start is the only one a visitor perceives.

## One connection string

`DATABASE_URL` is Neon's **direct**, unpooled endpoint, used for both runtime queries and
migrations. Neon scopes its pooled endpoint to serverless and connection-per-request workloads;
this is neither. The service is a single instance holding its own bounded `pg.Pool` through
`@prisma/adapter-pg`, against a free compute allowing `max_connections = 104` with seven reserved.
Routing runtime traffic through the transaction-mode pooler would buy burst headroom that a single
instance cannot use, and would cost a second environment variable, a `directUrl` in
`schema.prisma`, and a class of failure where migrations quietly address the wrong endpoint.

This is correct **because** ADR-0009 says the service runs as a single instance. It is the same
assumption that puts rate limiting in process, and it is load-bearing in both places.

## Migrations leave the cold-start path

Render's pre-deploy command — the natural home for `prisma migrate deploy` — is available only on
paid instances. On free the choice is the container's `CMD`, which would re-run migrations on every
cold start, many times a day; or a step outside the container.

**Migrations run outside the image entirely.** The server image's `CMD` is `node dist/index.js` and
nothing else, so it carries no Prisma CLI at all. Applying a migration is something a deployment
does, not something a server process does on its way up, and treating it as the latter was what put
a database migration tool inside a web server.

Two callers do it instead. Locally, a one-shot `migrate` compose service built from the image's own
`builder` stage — which already holds the CLI, the schema and the migrations — runs to completion
before the API starts, through `depends_on: service_completed_successfully`. `docker compose up`
therefore still needs no manual step, and a failed migration now keeps the API from starting
against a schema it does not match rather than crash-looping it. In the deployment, the GitHub
Actions job on `main` applies them to Neon after the suite passes and before it triggers Render's
deploy hook. Auto-deploy is off, so that workflow is the only way in.

`render.yaml` sets no `dockerCommand`: there is no longer a start-up behaviour to override, which
is a decision that removed a mechanism rather than adding one.

Configuration lives in a committed `render.yaml`, with secrets declared `sync: false` so their
shape is versioned and reviewable while their values never enter git.

## `/health`, never `/ready`

Render's health check gates **routing**, not merely restarts: a service failing it is pulled out of
the load balancer. Under one origin that service is also serving the React client. A check pointed
at `/ready`, which reports database connectivity by design, would therefore take the entire
frontend off the air whenever Neon blinked — turning an honest 503 from one endpoint into a
platform error page over the whole application.

The health check path is `/health`, which never touches the database. `/ready` stays what it was
built to be: a report something can ask for, whose status code is part of the report.

## Consequences

- **Demo credentials are published deliberately**, on the login screen. The deterministic seed of
  issue #53 covers every role across two Clients with differing Grants, and the demonstration worth
  giving — the same search returning different results to Viewers with different Permission Grants
  — is worthless if colleagues have to ask for passwords. This is safe only while the hosted bank
  holds seed data and colleagues' throwaway test Questions. **The first real Client-restricted
  Question put into this deployment invalidates the decision**, and the free tier has no backups.
- The seed is destructive and re-runnable, and is always run from a developer's machine against
  Neon. Render's free tier has no shell, no SSH and no one-off jobs, so there is no in-platform
  way to run it and no point designing one.
- Migrations are applied before the new code is deployed, so a migration must be compatible with
  the version still running for the few seconds between. Expand-then-contract, deliberately
  accepted.
- The `Dockerfile` is multi-stage and builds the client; its install can no longer be filtered to
  `@iqb/shared` and `@iqb/backend`, because the client's dependencies have to join it. The runtime
  stage is produced by `pnpm deploy --prod` rather than by copying `node_modules`, which matters
  more than it sounds: `pnpm prune --prod` acts only on the project it runs in, and in a workspace
  that is the root, which has no dependencies; and copying `node_modules` out of a pnpm workspace
  copies the entire `.pnpm` virtual store, so what the symlinks point at has no bearing on the size
  of the image. Measured, in order: **766MB** copying `node_modules` with the CLI, **624MB** via
  `pnpm deploy --prod`, **568MB** once migrations left the image.
- **About 125MB of the remainder is `pnpm deploy` copying store entries nothing links to** —
  `@prisma/studio-core`, `effect`, `pglite`, `react-dom`, `elkjs` — pulled in by the CLI during the
  builder's full install and left behind in `.pnpm`. The API's real tree is only `@iqb/shared`,
  `@prisma/client`, `@prisma/adapter-pg`, `express`, `pg`, `pino` and `zod`. Attempts to reclaim
  it, all failed under pnpm 9.15.9: `deploy --legacy` does not exist; `--config.node-linker=hoisted`
  ignores `--prod` and returns the dev tree; and `pnpm prune --prod` inside the deploy directory
  cannot resolve the injected workspace package and empties `node_modules`. Worth revisiting on a
  later pnpm, and cheap to check — the marker is whether `node_modules/.pnpm` holds
  `@prisma+studio-core`.
- **The `migrate` compose service bakes migrations in at build time**, because it runs from the
  `builder` stage and that stage copies the source. Adding a migration therefore needs
  `docker compose up --build`, not `docker compose up`. This is a genuine footgun: a plain `up`
  after writing a migration silently applies the previous set.
- Render's Hobby workspace includes 500 build-pipeline minutes a month, and every merge to `main`
  spends some. A build that grows past a few minutes is a budget question, not just a slow one.
- Query-plan evidence (issues #12, #55) is captured locally against the compose Postgres and
  committed. Free-tier compute is throttled and shared, so timings taken there measure the host's
  spare capacity rather than the indexing decisions they are meant to defend.
- **ADR-0009's `pg_stat_statements` reasoning is scoped to local by this decision.** Neon does
  preload the extension on the free plan, but its counters do not survive a compute suspend, and
  suspend cannot be disabled — so on the deployment they report only whatever has happened since
  the last wake, which for an idle demo is nearly nothing.
- If ADR-0009's single-instance assumption is ever dropped, three things here break together: the
  direct connection string, in-process rate limiting, and the sizing of the client-side pool.
