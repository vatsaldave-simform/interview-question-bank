# Backend Structure

How `backend/src` is laid out, what to name a new file, and how to comment it. The reasoning is in
ADR-0020; this is the rule to follow.

## Where a file goes

```
backend/src/
├── index.ts            process entry: env, dependencies, signals
├── app.ts              Express setup and middleware order
├── api.routes.ts       what mounts under /api, and in what order
├── features/<name>/    one domain concern, end to end
├── platform/           what belongs to no feature
│   └── http/           Express middleware, health, frontend serving
├── commands/           things a person runs: `pnpm db:seed`
└── generated/          Prisma output; never edited
```

Decide with these, in order:

1. Is it a domain concern from `CONTEXT.md` (Question, Viewer, Rating, Client, …)? →
   `features/<name>/`.
2. Would a second feature want it? → `platform/`.
3. Is it Express setup code? → `platform/http/`.
4. Is it a script someone runs from the command line? → `commands/`.

**Features may import from `platform/`, and from another feature where the domain depends that way.
`platform/` may never import from `features/`.**

## Naming

A file is named after what it is, never after the library it is built from — `platform/database.ts`,
not `prisma.ts`.

Six suffixes, and no others:

| suffix | holds |
|---|---|
| `.routes.ts` | an Express `Router` |
| `.middleware.ts` | an Express `RequestHandler` used as middleware |
| `.repository.ts` | database reads and writes for one concern |
| `.service.ts` | logic a route handler outgrew |
| `.schema.ts` | Zod schemas owned by the backend (shared ones live in `@iqb/shared`) |
| `.seed.ts` | seed data |

Anything else is a plain module named after the concept it owns: `access-token.ts`, `password.ts`,
`env.ts`, `request-context.ts`. Suffixes disambiguate the roles that repeat once per feature; a
concept that appears once does not need one. **A suffix outside this table needs a reason.**

A `.service.ts` is created when a route handler does more than parse, call and respond — not
before. Do not add one to satisfy symmetry.

In `tests/`, a helper says it is a test helper: `test-database.ts`, `test-api.ts`. Test files are
named after the contract they hold the API to (`error-contract.test.ts`, `request-id.test.ts`),
not after the source file they exercise, and `tests/` stays flat.

## Words in names

A word in a name means the same thing in every file of `backend/src` and `shared`, so a reader
can guess what a function does without opening it.

| word | means | example |
|---|---|---|
| `viewer` | the Viewer the request acts as | `rateQuestion(database, viewer, …)` |
| `target` | the Viewer an act is done to | `deactivateViewer(database, viewer, targetId)` |
| `find…` | reads one row, or null when there is none | `findViewerById` |
| `get…` | reads one row, or throws Not Found | `getViewer` |
| `findEvery…` | reads every row | `findEveryCategoryWithTags` |
| `list…` | a service that builds a list | `listQuestions` |
| `with…` | adds data to rows already read | `withRatingSummaries` |
| `insert…` | adds a new row | `insertQuestion` |
| `set…` | changes fields of one row | `setRole` |
| `save…` | adds a row, or replaces the one already there | `saveRating` |
| `create…` | a factory: builds and returns an object | `createApp`, `createLogger` |
| `spend…` | marks a single-use token used | `spendRefreshToken` |
| `…Of` | belonging to the one Viewer or token passed in | `endUnusedPasswordTokensOf` |
| `…FromDb` | a database row as the code reads it | `QuestionFromDb` |
| `…Config` | plain values passed in | `RefreshTokenConfig` |
| `…Dependencies` | what a factory is handed | `AppDependencies` |

A service is named after the act's verb in `CONTEXT.md`: `raiseRoleRequest`, `issuePermissionGrant`.
So `createClient` is a service and not a factory, because an Administrator creates Clients.

Stored Change Event payloads and API fields keep their names, even where they break this table.
A `viewer` field in a payload names the Viewer acted on, and renaming it would change data
already stored.

## Comments

The code carries the *what*. A comment exists only for the *why*, and only where a reader could
otherwise break something. Write it in plain words and short sentences
(`docs/agents/plain-language.md`).

1. **Never paraphrase the line below.** `/** Reads a dotenv file if it is there. */` above
   `loadEnvFile` is noise; *"real environment variables win over the file"* is not.
2. **One sentence.** If it needs a paragraph, it is an ADR — write the ADR and leave the conclusion
   plus `(ADR-00NN)`. At most one comment per file may run to three lines, for a trade-off with no
   ADR home yet.
3. **Comment at the point of surprise**, not in a summary at the top of the file.
4. **Always keep**: a security or timing trade-off, an ordering constraint (middleware order, where
   the sign-in check sits), and a deliberate non-obvious choice (`index: false`,
   `clockTolerance: 0`).
5. **Deletion test**: if removing the comment would not let a future reader break something, remove
   it.

`/** … */` on exported symbols, so it surfaces on hover. `//` inside function bodies.
