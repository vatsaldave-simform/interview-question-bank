# The backend is laid out by feature, not by layer

The obvious shape for an Express API is a folder per layer: `routes/`, `controllers/`, `services/`,
`repositories/`. It reads well at four files and badly at forty. The bank has nine domain concerns
coming — Questions, Tags, Categories, Ratings, Clients, Permission Grants, Change Events, Role
Requests, Viewers — and under a layered tree each of them scatters across five directories, every
directory fills with near-identically named files, and adding one concern means touching all five.

So `src/` has two zones instead. `src/features/<concern>/` holds everything about one domain
concern: its routes, its data access, its rules. `src/platform/` holds what belongs to no concern —
the environment schema, the Prisma client, the logger and request context, the error classes, the
HTTP server lifecycle, and the Express middleware under `src/platform/http/`. Adding a concern adds
a folder; reading `src/features/` is reading the domain.

Health and frontend-serving live in `platform/http/`, not in `features/`. Neither is a domain
concept: `/health` and `/ready` are the contract with Render (ADR-0012), and the frontend router
serves a build artifact. `app.ts`, `index.ts` and `api.routes.ts` sit loose at the root of `src/`
because wiring the zones together is the one job that belongs to neither.

There is no service layer yet, and that is deliberate rather than an omission. A route that parses,
calls one function and responds does not need a file between those steps; a route that checks
visibility, runs Near-Duplicate detection and records a Change Event does. Services get extracted
when a handler earns one, so the tree never fills with pass-through files that exist to satisfy a
rule.

## Consequences

A file that both a feature and the platform need pulls toward `platform/` — and the pull is real,
so the test is whether a second feature would want it, not whether the first one happens to.

Features may import from `platform/`, and from each other where the domain genuinely depends that
way: `auth/` reads Viewers through `viewers/`. Nothing in `platform/` may import from `features/`,
because the moment it does the zones stop meaning anything.

`src/generated/prisma/` stays inside `src/` despite being machine-written. Moving it out forces
`rootDir` to the package root, which re-emits the build as `dist/src/index.js` and breaks the
image's `CMD`, `render.yaml` and ADR-0012 along with it. Not worth it for a folder named
`generated`.

The operating rules this implies — the closed list of filename suffixes, where a new file goes,
and how comments are written — live in `docs/agents/backend-structure.md`, because they are
instructions to follow rather than a decision to remember.
