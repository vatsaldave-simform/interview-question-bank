# Frontend Structure

How `frontend/src` is laid out, what to name a new file, and which skill to read before writing one.
The reasoning is in ADR-0030 and ADR-0031; this is the rule to follow.

## Where a file goes

```
frontend/src/
├── main.tsx            mounts the root element
├── App.tsx             the providers, and the order they wrap in
├── routes.tsx          the whole URL shape, assembled from the features
├── features/<name>/    one domain concern, end to end
├── platform/           what belongs to no feature
├── ui/                 hand-written components more than one feature uses
│   └── shadcn/         written by `shadcn add`; never edited
└── index.css           the only stylesheet
```

Decide with these, in order:

1. Did `shadcn add` write it? → `ui/shadcn/`, and leave it alone.
2. Is it a domain concern from `CONTEXT.md` (Question, Viewer, Client, Change Event, …)? →
   `features/<name>/`.
3. Would a second feature want it? → `platform/`.
4. Is it a component a second feature now imports? → `ui/`. Not before: a component starts inside
   the feature that needed it and moves when a second one asks for it.

Features are named after the bank, not after the screens. Browse, contribute, review and ratings are
four views of one concern and share `features/questions/`. The administration console is a route,
not a feature (ADR-0015).

`platform/` holds the API client, the access token, the query client, the app shell, the sign-in
check and the error boundary. `features/auth/` holds the login screen, logging out, and the silent
sign-in on load.

**Features may import from `platform/` and `ui/`, and from another feature where the domain depends
that way. Nothing in `platform/` or `ui/` may import from `features/`.**

## Naming

A file is named after what it is, never after the library it is built from — `platform/query-client.ts`,
not `tanstack.ts`.

Files are kebab-case, exports are not: `question-list.tsx` exports `QuestionList`. Imports inside
`frontend/src` are written `@/`-prefixed and carry no extension, unlike the backend (`.ts`,
ADR-0032) and `shared` (`.js`) (ADR-0030).

Three suffixes, and no others:

| suffix | holds |
|---|---|
| `.routes.tsx` | the routes one feature exports, put together in `src/routes.tsx` |
| `.queries.ts` | the query and mutation hooks for one concern |
| `.schema.ts` | zod schemas the frontend owns: search parameters and form state (shapes the API also uses live in `@iqb/shared`) |

Anything else is a plain module named after the concept it owns: `access-token.ts`, `use-session.ts`,
`question-card.tsx`, `app-shell.tsx`. **A suffix outside this table needs a reason**, and
`.hooks.ts` is not getting one — a file named after a mechanism collects everything that shares the
mechanism and nothing that shares a purpose. A hook that is not a query hook is named after what it
does.

In a feature with several screens, a file that belongs to one of them carries its name as a prefix:
`browse-filters.tsx`, `contribute-form.tsx`, `review-queue.tsx`. A file serving more than one screen
drops the prefix — that is the signal it belongs to the concern rather than the screen.

## Types

Any shape that also exists in an API request or response is inferred from `@iqb/shared` and never
written out again. A hand-copied type keeps compiling long after the API has changed, which is the
failure ADR-0010 exists to prevent.

Shapes that only exist in the browser — form state, the filters currently applied — are ordinary
local types, and their zod schemas go in the feature's `.schema.ts`.

There is no file here that decides what a Viewer may see or do. Visibility and permission are
answered by the API and reflected by the interface: render what the API returned, and report the
refusal it sends. `backend/src/features/questions/may-edit.ts` has no counterpart on this side, and
adding one would mean two answers to the same question.

## Styling

Tailwind classes in the component. `src/index.css` is the only stylesheet: it holds the Tailwind
directives and the theme variables shadcn reads. No CSS modules, no CSS-in-JS, and no second
stylesheet.

## Tests

Tests live in `frontend/tests/`, flat, as on the backend. They are named after the behaviour they
pin — `login-rejects-bad-credentials.test.tsx` — not after the file they exercise, because a
component has no single contract the way an HTTP route does. A helper says it is a test helper.

No test runner is configured yet. The first ticket that needs one picks it.

The browser test in #16 is not part of this package. It drives the API and the client running
together, so it does not belong to either one.

## Comments

The five rules in `docs/agents/backend-structure.md` apply here unchanged: the comment says *why*,
one sentence, at the point of surprise, and it goes if removing it could not let anyone break
anything. Plain words and short sentences, as everywhere (`docs/agents/plain-language.md`).

Two places on this side are ordering constraints, and earn a comment the way middleware order does:
the order the providers wrap in inside `App.tsx`, and where the sign-in check sits relative to the
routes it guards.

## Reach for these

Read these before writing, not after:

- **`tanstack-router`** — before adding or changing a route, or anything that reads the URL. Routes
  here are written in code rather than as files, which most examples are not (ADR-0031).
- **`tanstack-query`** — before fetching, caching or invalidating anything.
- **`shadcn`** — before adding a component, so it arrives in `ui/shadcn/` configured rather than
  pasted in by hand.

And when the question comes up:

- **`vercel-react-best-practices`** — what a change costs to render or to download.
- **`vercel-composition-patterns`** — when a component has grown a row of boolean props.
- **`frontend-design`** — when a screen is being designed rather than assembled.
- **`web-design-guidelines`** — reviewing a screen for accessibility and the interface basics.
