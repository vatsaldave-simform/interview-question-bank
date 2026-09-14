# RLS vs. an application-level scoped query seam

Primary-source research for the "a user without permission for a client sees a genuine zero-match"
requirement on Node/Express + PostgreSQL + Prisma.

Researched 2026-09-14. Postgres docs cited are **PostgreSQL 18.6** (`/docs/current`) unless a `/docs/17/`
URL is given. Prisma state as of this date: **ORM 8 is a release candidate** (`8.0.0-rc.14`, npm `latest`),
**ORM 7.10.0 is the current fully-supported line**.

---

## Verdict (short)

**Use (B), the application-level scoped query seam, as the enforcement mechanism for the 10-day POC.
Do not adopt (A) RLS for the search path.**

The deciding fact is not the pooling ergonomics (those are solvable) — it is a documented Postgres
planner rule:

> "an index scan cannot be selected for queries on security barrier views (or tables with row-level
> security policies) if an operator used in the `WHERE` clause is associated with the operator family
> of the index, but its underlying function is not marked `LEAKPROOF`."
> — https://www.postgresql.org/docs/current/rules-privileges.html

The full-text operator `tsvector @@ tsquery` resolves to `ts_match_vq`
(https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_operator.dat,
oid 3636), and `ts_match_vq` is **not** marked leakproof in the system catalog
(https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_proc.dat).
Requirement 5 of this project is that the permission predicate compose with a full-text predicate and
tag joins **in one indexed plan**. Enabling RLS on the searched table is documented to work against
exactly that.

This also means the tempting "ship B now, add RLS later as defence-in-depth" plan is **not free** —
adding RLS to the same table later reintroduces the index problem on the same day you add it.

Ranked reasons, strongest first:

| # | Finding | Status |
|---|---------|--------|
| 1 | RLS on a table blocks index scans for non-LEAKPROOF operators in that index's opfamily; `@@`/`ts_match_vq` is non-leakproof | **Documented** (docs) + **source-confirmed** (catalog). The step "therefore your GIN plan degrades" is my **inference** — verify with `EXPLAIN`, snippet below |
| 2 | Carrying viewer identity safely through Prisma's pool requires wrapping **every** request in an interactive transaction | **Documented** by Prisma |
| 3 | Prisma's own RLS example is explicitly "not intended to be used in production environments" and breaks explicit `$transaction()` | **Documented** (Prisma-owned repo) |
| 4 | No `schema.prisma` RLS support in ORM 7; ORM 8 has it but is RC/Early Access and has **no `$extends`** | **Documented** |
| 5 | Prisma Migrate makes the app user the table owner, so `FORCE ROW LEVEL SECURITY` is mandatory or policies silently do nothing | **Documented** |

Where (A) still wins, and should be said out loud when defending this: RLS is the only option that is
**default-deny at the database**, so a future read path that forgets the seam is still safe. (B) buys
its performance by making correctness a convention. Mitigations for that are in
[§7](#7-verdict-in-full).

---

## 1. How viewer identity reaches the policy

| Form | Scope | Source |
|---|---|---|
| `SET x.y = '…'` / `SET SESSION x.y = '…'` | **Session.** "Once the surrounding transaction is committed, the effects will persist until the end of the session, unless overridden by another `SET`." | https://www.postgresql.org/docs/17/sql-set.html |
| `SET LOCAL x.y = '…'` | **Transaction.** "The effects of `SET LOCAL` last only till the end of the current transaction, whether committed or not." Outside a transaction block it "emits a warning and otherwise has no effect." | https://www.postgresql.org/docs/17/sql-set.html |
| `set_config('x.y', v, is_local => true)` | **Transaction.** "If `is_local` is `true`, the new value will only apply during the current transaction. If you want the new value to apply for the rest of the current session, use `false` instead." | https://www.postgresql.org/docs/17/functions-admin.html |
| `current_setting('x.y', true)` | Read. "If there is no such setting, `current_setting` throws an error unless `missing_ok` is supplied and is `true` (in which case NULL is returned)." | https://www.postgresql.org/docs/17/functions-admin.html |

Namespaced parameters need no prior definition: "PostgreSQL will accept a setting for any two-part
parameter name. Such variables are treated as placeholders and have no function until the module that
defines them is loaded."
(https://www.postgresql.org/docs/17/runtime-config-custom.html)

**Only `SET LOCAL` / `set_config(..., true)` is safe with a connection pool.** `set_config` is
preferable to `SET LOCAL` in Prisma because it is a function call and therefore parameterizable —
`SET LOCAL` takes a literal, not a bind parameter.

```sql
-- safe, parameterizable, transaction-scoped
SELECT set_config('app.viewer_id', $1, TRUE);
```

**Unconfirmed / my inference:** `current_setting('app.viewer_id', TRUE)` returns NULL when unset, so
`col = NULL::uuid` is NULL, not true, and the row is filtered — a clean default-deny. But if the
parameter is set to the empty string, `''::uuid` raises `invalid input syntax for type uuid`, which is
an *error*, not zero rows — i.e. **distinguishable** from a genuine zero-match, violating the core
requirement. The docs do not discuss this. Guard it:

```sql
USING ("clientId" = NULLIF(current_setting('app.viewer_id', TRUE), '')::uuid)
```

---

## 2. The connection-pooling interaction (the crux)

**Yes, the risk is real, and Prisma documents it in its own words.** From the Prisma-owned
`prisma/prisma-client-extensions` RLS example README:

> "However, each time you run a query, Prisma may use a different connection from the connection pool.
> In order to associate the parameter with all of the queries in the context of a given request in your
> application, you should:
> 1. Start a transaction.
> 2. Set the runtime parameter as a `LOCAL` setting, which lasts only until the end of the current
>    transaction. This may be done by passing `TRUE` to the third argument (`is_local`) of the
>    `set_config()` function.
> 3. Run all queries for the duration of the request inside this transaction.
>
> All queries for a given transaction will use the same database connection, and because the setting is
> local, it won't affect any other transactions."

— https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security

So: **consecutive `prisma.$executeRaw` calls are NOT guaranteed to land on the same pooled connection.**
A session-scoped `SET` would therefore leak the previous viewer's identity onto a connection that a
later, unrelated request picks up. That is the exact failure mode in the question, and it is documented,
not inferred.

### Interactive transactions are what pin statements to one connection

ORM 7 (the line to build on):

> "One transaction means that all queries inside it have to be run on the same connection."
> — https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions

ORM 8 (RC) states it even more directly:

> "Every call on `tx` uses the same transaction connection, and queries on `db` run outside the
> transaction."
> — https://www.prisma.io/docs/orm/reference/transactions-and-runtime

And ORM 8's "Common mistakes": "Queries on `db` run on their own connection, outside the open
transaction." (https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

### Is there per-request connection context *outside* a transaction?

**No documented mechanism.** What I checked:

- **Client extensions (`$extends`)** — GA in ORM 6/7. The docs name RLS as a use case: "Implement
  row-level security (RLS), where each HTTP request has its own client with its own RLS extension,
  customized with session data" (https://www.prisma.io/docs/orm/prisma-client/client-extensions) and
  "user isolation in a row-level security (RLS) extension"
  (https://www.prisma.io/docs/orm/prisma-client/client-extensions/query). But the extension does **not**
  give connection affinity — Prisma's own example achieves affinity by *opening a transaction inside the
  extension*. The extension is only the mechanism that guarantees you never forget to.
- **Driver adapters** — "When using Prisma Client with a driver adapter, database connections are
  managed by the driver and its pool. They are not exposed to the developer and **it is not possible to
  manually access individual connections**."
  (https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)
  So you cannot check out a `pg` connection, `SET` on it, and hand it to Prisma.
- **ORM 8 `RuntimeExecuteOptions.scope`** — looks promising, isn't: `scope?: 'runtime' | 'connection' |
  'transaction'` is "A label middleware reads. The runtime sets it; **setting it yourself changes only
  the label, not where the query runs**."
  (https://www.prisma.io/docs/orm/reference/transactions-and-runtime)
- **AsyncLocalStorage** — no endorsement in the Prisma docs. AsyncLocalStorage can carry the *viewer id*
  through your request, but it cannot carry a *database connection* that Prisma won't expose. Not a
  solution to this problem.
- **Connection-string-per-user** (`?options=-c app.x=…`) was proposed on the RLS issue and answered by a
  Prisma maintainer: it requires "a new client for each of the distinct users you have", with
  "*Connection limits*… *Startup time*… *Memory issues*".
  (https://github.com/prisma/prisma/issues/12735)

### What the official Prisma example actually looks like — and its caveat

```typescript
// https://github.com/prisma/prisma-client-extensions/blob/main/row-level-security/script.ts
function forCompany(companyId: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    })
  );
}
```

Two caveats stated in that repo's README, both material:

> "**NOTE**: Because this example extension wraps every query in a new batch transaction, explicitly
> running transactions with `companyPrisma.$transaction()` may not work as intended."

> "This extension is provided as an example only. **It is not intended to be used in production
> environments.**"

The example pins `@prisma/client` to `6.19.3` — i.e. it is maintained against ORM 6, two majors behind.

**Practical consequence for the POC:** every read, including the search endpoint, must execute inside
`prisma.$transaction(async (tx) => …)`. Prisma warns against exactly this shape: "**Use interactive
transactions with caution**. Keeping transactions open for a long time hurts database performance and
can even cause deadlocks."
(https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

---

## 3. Does RLS apply to the role Prisma connects as?

**By default, almost certainly not — and this is the classic silent failure.**

> "Superusers and roles with the `BYPASSRLS` attribute always bypass the row security system when
> accessing a table. Table owners normally bypass row security as well, though a table owner can choose
> to be subject to row security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`."
> — https://www.postgresql.org/docs/current/ddl-rowsecurity.html

> "These forms control the application of row security policies belonging to the table when the user is
> the table owner. If enabled, row-level security policies will be applied when the user is the table
> owner. **If disabled (the default) then row-level security will not be applied when the user is the
> table owner.**"
> — https://www.postgresql.org/docs/17/sql-altertable.html

`NOBYPASSRLS` is the default for a role
(https://www.postgresql.org/docs/17/sql-createrole.html), so the owner exemption, not `BYPASSRLS`, is
the trap here.

Prisma Migrate runs DDL as the connection user, so **that user owns the tables** and is exempt unless
forced. Prisma's own example says so:

> "The second command (`FORCE ROW LEVEL SECURITY`) tells Postgres to apply row level security even for
> the table's owner, which normally bypasses row security policies. **This is important if the database
> user that you run migrations with is the same user that your application uses to connect to the
> database.**"

The documented fix, per table:

```sql
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Question" FORCE  ROW LEVEL SECURITY;  -- required: app user owns the table
```

Also worth knowing for a security review: "Referential integrity checks, such as unique or primary key
constraints and foreign key references, **always bypass row security**… Care must be taken… to avoid
'covert channel' leaks of information through such referential integrity checks."
(https://www.postgresql.org/docs/current/ddl-rowsecurity.html). A unique-constraint violation on an
invisible row is observable — another way a "zero match" becomes distinguishable.

---

## 4. Prisma Migrate and RLS

### Can policies be declared in `schema.prisma`?

- **ORM 7 (the supported line): no.** `prisma/prisma#12735` "Support for row-level security (RLS)" is
  **still open**, opened 2022-04-08, last updated 2025-10-10, labelled `kind/feature`, `topic: rls`,
  `status/has-stopgap`. (https://github.com/prisma/prisma/issues/12735)
- **ORM 8 (release candidate): yes, but Early Access.** The 2026-07-17 changelog adds "Row-Level
  Security policy authoring in the schema and in TypeScript", introducing `@@rls`, `policy_select`,
  `policy_update` in PSL and `rlsEnabled`, `policySelect`, `policyUpdate` in the TypeScript contract
  builder. The page itself carries the banner "Prisma 8 is in Early Access. Scope and behavior may still
  change." (https://www.prisma.io/changelog/2026-07-17)

**Why ORM 8 does not rescue option (A) for this POC:**

- Prisma ORM 8 is "a release candidate" with GA "expected in October 2026", and the docs warn "some
  details of the API may still change, so code you write now may need small edits later".
- **`$extends` is listed as not available yet in ORM 8.** So the one ergonomic way to guarantee every
  query is wrapped in an identity-carrying transaction does not exist on the version that has
  schema-level policies. You would hand-roll it.
- (both: https://www.prisma.io/docs/prisma-orm/release-status)
- There is no RLS/policy page in the ORM 8 docs index (https://www.prisma.io/docs/llms/orm.txt) — the
  feature is currently changelog-only.

### If policies live in custom SQL migrations (the ORM 7 path)

Workflow is `npx prisma migrate dev --create-only`, edit the generated `migration.sql`, then
`npx prisma migrate dev` (https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations).
The real migration from Prisma's example:

```sql
-- prisma/migrations/20221211203153_row_level_security/migration.sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "User"
  USING ("companyId" = current_setting('app.current_company_id', TRUE)::uuid);

-- optional escape hatch for admin/lookup queries, combined with OR (permissive)
CREATE POLICY bypass_rls_policy ON "User"
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

Documented pitfalls:

- **Applied migrations are replayed, so the SQL persists** — but Prisma's schema is still the source of
  truth for tables, and it does not know policies exist. "Do not edit or delete migrations that have
  been applied."
  (https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production)
- **`prisma migrate dev` "Reruns the existing migration history in the shadow database in order to
  detect schema drift"** and prompts for a reset on "Migration history conflicts caused by modified or
  missing migrations" or when "the database schema has drifted away from the end-state of the migration
  history". (same URL)
- **`prisma migrate reset` "Drops the database/schema if possible…", "Creates a new database/schema…",
  "Applies all migrations", "Runs seed scripts."** Policies come back only because they are in a
  migration file — which is the argument for putting them there and never in a manual `psql` session.
- **Shadow database**: "a second, temporary database that is created and deleted automatically each time
  you run `prisma migrate dev`"; on PostgreSQL "the user must be a super user or have `CREATEDB`
  privilege"; "not required in production, and is not used by… `prisma migrate deploy`."
  (https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database).
  Note the tension with §3: the *migration* user needs `CREATEDB`; the *runtime* user should be minimal.
- **Columns that reference the setting** must be declared with `dbgenerated`, or inserts fail the policy:
  ```prisma
  companyId String @default(dbgenerated("(current_setting('app.current_company_id'::text))::uuid")) @db.Uuid
  ```
- **ORM 8 changes the migration format entirely** — migrations are TypeScript compiled to `ops.json`
  ("You edit `migration.ts`. Running it regenerates `ops.json`. The runner only ever executes
  `ops.json`."), with a `rawSql({ id, label, operationClass, target, precheck, execute, postcheck })`
  escape hatch. (https://www.prisma.io/docs/orm/migrations/editing-a-migration) Anything hand-written
  against ORM 7 migrations does not carry over.

**Unconfirmed:** whether `prisma migrate dev` drift detection ever *reports* a policy as drift. Policies
are not in the Prisma schema, and the docs do not say. My expectation is no — but I did not verify, and
the task says not to run migrations.

---

## 5. Performance — the decisive section

### The documented rule

Policy quals run first, and user quals containing non-leakproof functions cannot overtake them:

> "This expression will be evaluated for each row **prior to any conditions or functions coming from the
> user's query**. (The only exceptions to this rule are `leakproof` functions, which are guaranteed to
> not leak information; the optimizer may choose to apply such functions ahead of the row-security
> check.)"
> — https://www.postgresql.org/docs/current/ddl-rowsecurity.html

> "`LEAKPROOF` indicates that the function has no side effects… This affects how the system executes
> queries against views created with the `security_barrier` option **or tables with row level security
> enabled**. The system will enforce conditions from security policies and security barrier views before
> any user-supplied conditions from the query itself that contain non-leakproof functions… **This option
> can only be set by the superuser.**"
> — https://www.postgresql.org/docs/current/sql-createfunction.html

And the concrete consequence for indexes:

> "For example, **an index scan cannot be selected for queries on security barrier views (or tables with
> row-level security policies) if an operator used in the `WHERE` clause is associated with the operator
> family of the index, but its underlying function is not marked `LEAKPROOF`.**"
> — https://www.postgresql.org/docs/current/rules-privileges.html

> "Views created with the `security_barrier` may perform far worse than views created without this
> option. In general, there is no way to avoid this: **the fastest possible plan must be rejected if it
> may compromise security.**" (same URL)

Separately, planner *statistics* are also restricted: "the current user must either have `SELECT`
privilege on the table or the involved columns, or the operator used must be `LEAKPROOF`… If not, then
the selectivity estimator will behave as if no statistics are available."
(https://www.postgresql.org/docs/17/planner-stats-security.html)

### Which of our operators are leakproof? (checked in the catalog)

| Predicate | Underlying function | `proleakproof` |
|---|---|---|
| `"clientId" = $1::uuid` (the policy itself) | `uuid_eq` | **`t`** |
| `text = text` | `texteq` | **`t`** |
| `tsvector @@ tsquery` (**our search**) | `ts_match_vq` | **absent → false** |
| `text @@ text`, `text @@ tsquery` | `ts_match_tt`, `ts_match_tq` | absent → false |

Source: `pg_operator.dat` oid 3636 maps `@@(tsvector,tsquery)` to `oprcode => 'ts_match_vq'`;
`pg_proc.dat` defines `ts_match_vq` with no `proleakproof` key, while 345 other entries carry
`proleakproof => 't'` (e.g. `texteq`, `uuid_eq`), confirming the key is explicit-opt-in, not defaulted on.
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_operator.dat
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_proc.dat

### So what

The equality predicate in the **policy** is leakproof and composes fine. The **full-text predicate in
the user's query is not**, and it is the one that needs the GIN index. Combining the documented rule
with the catalog gives: enabling RLS on the table that holds the `tsvector` should prevent the planner
from choosing a GIN index scan for `@@`, forcing a sequential scan plus filter.

**This last step is my inference, not a doc statement.** It is cheap to settle empirically, and the POC
should — budget 30 minutes:

```sql
-- run as the app (non-owner-exempt) role, RLS forced, with app.viewer_id set
BEGIN;
SELECT set_config('app.viewer_id', '…uuid…', TRUE);
EXPLAIN (ANALYZE, BUFFERS)
SELECT q.id
FROM   "Question" q
WHERE  q.search_vector @@ websearch_to_tsquery('english', 'index scan')
LIMIT  20;
ROLLBACK;

-- then: ALTER TABLE "Question" NO FORCE ROW LEVEL SECURITY;  and re-run.
-- Compare "Bitmap Index Scan on question_search_idx" vs "Seq Scan on Question".
```

Documented mitigations, neither attractive:

1. `ALTER FUNCTION ts_match_vq(tsvector, tsquery) LEAKPROOF;` — the docs say leakproof "can only be set
   by the superuser", and doing this changes a global security property of the operator for the whole
   cluster. Do not do this on the strength of a POC.
2. Keep RLS off the searched table and put the permission predicate in the query — which is option (B).

There is also a documented cost to *referencing another table* from a policy: "users who are using a
given policy must be able to access any tables or functions referenced in the expression or they will
simply receive a permission denied error" (https://www.postgresql.org/docs/17/sql-createpolicy.html) —
so a policy of the form `EXISTS (SELECT 1 FROM "ClientGrant" …)` needs `SELECT` granted on
`"ClientGrant"` to every app user, and the docs note that locking workarounds for such sub-SELECTs
"could pose a performance problem"
(https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

---

## 6. Testability

The Postgres docs treat this as a first-class step and demonstrate it with `SET ROLE`:

> "As with any security settings, it's important to test and ensure that the system is behaving as
> expected."
>
> ```
> postgres=> set role alice;
> SET
> postgres=> update passwd set real_name = 'John Doe' where user_name = 'admin';
> UPDATE 0
> ```
> — https://www.postgresql.org/docs/current/ddl-rowsecurity.html

Two documented primitives for a test harness that connects as a superuser or table owner:

1. **`SET ROLE`** inside the test transaction, to drop from the owner/superuser to the app role. This is
   what makes an owner-connected Jest/Vitest harness able to assert the deny path at all — without it,
   the owner exemption (§3) means every RLS test passes vacuously.
2. **`row_security = off`** as a canary: "This does not in itself bypass row security; what it does is
   **throw an error if any query's results would get filtered by a policy**." (same URL) Useful as an
   inverted assertion — "this query must NOT be silently filtered".

Sketch (ORM 7). Note it must be one interactive transaction, per §2:

```typescript
it('a user without a grant for the client sees zero rows, not an error', async () => {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE app_user`;                       // shed owner exemption
    await tx.$executeRaw`SELECT set_config('app.viewer_id', ${outsiderId}, TRUE)`;
    return tx.$queryRaw`SELECT id FROM "Question" WHERE "clientId" = ${otherClientId}::uuid`;
  });
  expect(rows).toEqual([]);                 // zero rows...
});                                          // ...and no throw — the indistinguishability property
```

**Unconfirmed:** the Prisma docs say nothing about testing RLS, about `SET ROLE`, or about a
test-harness role strategy. The above combines the Postgres pattern with Prisma's transaction API; I
found no Prisma-documented equivalent.

**Testability is where (B) is plainly easier**, and this is a fair point to concede in either direction:
under (B) the permission predicate is ordinary SQL in an ordinary query, so a unit test needs no roles,
no `SET`, and no transaction — but it also only tests the seam, not the paths that bypassed it.

---

## 7. Verdict in full

### (A) Postgres RLS

**For**
- Default-deny at the database: "If no policy exists for the table, a default-deny policy is used,
  meaning that no rows are visible or can be modified."
  (https://www.postgresql.org/docs/current/ddl-rowsecurity.html) A forgotten read path is still safe.
- Filtering is invisible to the client by construction — a non-matching row is "silently suppressed"
  (https://www.postgresql.org/docs/17/sql-createpolicy.html), which is exactly the
  indistinguishable-zero-match property, for `SELECT`.
- Enforcement survives raw SQL, a psql session, and a future second service on the same database.

**Against** (all documented unless marked)
- Blocks the GIN index for `@@` on the RLS-enabled table (§5) — **directly contradicts requirement 5**.
- Requires every request to run inside an interactive transaction, against Prisma's own "keep
  transactions short" guidance (§2).
- Requires `FORCE ROW LEVEL SECURITY` or it silently does nothing under Prisma Migrate (§3).
- Policies live outside `schema.prisma` on ORM 7; the ORM 8 feature that fixes this is Early Access on a
  release candidate that lacks `$extends` (§4).
- Prisma's reference implementation is labelled not-for-production and breaks explicit `$transaction()` (§2).
- Referential-integrity checks bypass RLS, leaking existence via constraint errors (§3).
- Roughly 2–3 of the 10 POC days go to plumbing and its failure modes rather than to the feature.

### (B) Scoped query seam

**For**
- Every predicate is ordinary SQL, so the planner composes the permission `EXISTS`, the `@@` full-text
  predicate, and the tag joins with no security-barrier restriction — one indexed plan, which is the
  stated requirement.
- No per-request transaction, no session state, no pool hazard: identity is a function argument.
- Works identically on ORM 7 today and ports to ORM 8's builder later.
- Testable without roles or superuser.

**Against**
- Enforcement is a convention. Nothing in the database stops a new `prisma.question.findMany()` that
  skips the seam. **This is the whole of the trade** — be ready to say so plainly rather than defend
  (B) as strictly safer.

### Recommendation for the 10-day POC

1. Build (B). Pin `prisma`/`@prisma/client` to `^7` — ORM 7 "will receive bug fixes and security updates
   for 18 months from the day Prisma ORM 8 reaches general availability"
   (https://www.prisma.io/docs/prisma-orm/release-status). Do not start a POC on `8.0.0-rc`.
2. Make the seam the only exported read path — one module that returns scoped queries; nothing else
   exports the raw client. Compose the grant as a correlated `EXISTS` so it stays a join-order option
   for the planner:

```typescript
// the single seam every read path goes through
export function scopedQuestions(viewerId: string) {
  return {
    search: (q: string, tagIds: string[]) => prisma.$queryRaw`
      SELECT qn.id, qn.title
      FROM   "Question" qn
      WHERE  EXISTS (
               SELECT 1 FROM "ClientGrant" g
               WHERE  g."clientId" = qn."clientId"
                 AND  g."userId"   = ${viewerId}::uuid
             )
        AND  qn.search_vector @@ websearch_to_tsquery('english', ${q})
        AND  (cardinality(${tagIds}::uuid[]) = 0 OR EXISTS (
               SELECT 1 FROM "QuestionTag" qt
               WHERE qt."questionId" = qn.id AND qt."tagId" = ANY(${tagIds}::uuid[])
             ))
      LIMIT 20`,
  };
}
```
   Index `"ClientGrant"("userId","clientId")` and GIN on `search_vector`.
3. Make "bypassed the seam" a *build* failure, not a code-review hope — the cheapest honest
   substitute for RLS's default-deny. An ESLint `no-restricted-imports` rule on the raw client outside
   the seam module costs an hour and is a good thing to demo.
4. Spend 30 minutes on the `EXPLAIN` experiment in §5 with RLS on and off. That single before/after plan
   is the strongest possible artefact to bring to the walkthrough: it converts "we chose B" from a
   preference into a measurement.
5. Note RLS as future defence-in-depth **with the caveat attached**: it is not additive, it costs the
   search plan, and re-earning that plan means either a superuser `LEAKPROOF` change or keeping search
   off the RLS-protected table.

---

## Open / unconfirmed questions

1. **Does the GIN index actually get rejected under RLS in our schema?** Documented rule + catalog flag
   say it should; I did not run `EXPLAIN` (no database, and the task forbids migrations). Settle it in
   the POC — §5 has the snippet. This is the single highest-value open item.
2. **Does `prisma migrate dev` drift detection flag a policy as drift?** Not addressed by the docs.
   Policies are not in the Prisma schema, so I expect not — unverified.
3. **Empty-string setting → cast error rather than zero rows.** My inference from uuid cast semantics;
   not documented. `NULLIF(...)` guard proposed in §1, untested.
4. **ORM 8 `@@rls` surface.** Sourced from one changelog entry (2026-07-17); there is no docs page. Exact
   grammar, whether `policy_select` supports `FORCE`, and whether migrations emit `FORCE ROW LEVEL
   SECURITY` are all unknown. Re-check after ORM 8 GA (expected October 2026).
5. **PostgreSQL version drift in citations.** `ddl-rowsecurity`, `rules-privileges`, and
   `sql-createfunction` were read at `/docs/current` (= 18.6). `sql-set`, `functions-admin`,
   `sql-altertable`, `sql-createrole`, `sql-createpolicy`, `runtime-config-custom`, and
   `planner-stats-security` were read at `/docs/17/`. The quoted wording is long-standing, but I did not
   diff 17 against 18 for those seven pages.
6. **`$extends` in ORM 8.** Listed as "not available yet" on the release-status page; whether it returns
   before GA, and in what form, is unknown.
7. **Non-first-party options not evaluated.** `cerebruminc/yates`, `s1owjke/prisma-rls`,
   `kltk/prisma-extension-rls` appeared in search results. Out of scope under the primary-sources rule
   and flagged here only so nobody thinks they were assessed and rejected on merit.

---

## Sources

Every URL below was actually fetched and read for this document.

**PostgreSQL documentation**
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html (PostgreSQL 18.6)
- https://www.postgresql.org/docs/current/rules-privileges.html
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://www.postgresql.org/docs/17/sql-set.html
- https://www.postgresql.org/docs/17/functions-admin.html
- https://www.postgresql.org/docs/17/runtime-config-custom.html
- https://www.postgresql.org/docs/17/planner-stats-security.html
- https://www.postgresql.org/docs/17/sql-createpolicy.html
- https://www.postgresql.org/docs/17/sql-altertable.html
- https://www.postgresql.org/docs/17/sql-createrole.html

**PostgreSQL source (REL_18_STABLE)**
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_proc.dat
- https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/include/catalog/pg_operator.dat

**Prisma documentation**
- https://www.prisma.io/docs/llms.txt
- https://www.prisma.io/docs/llms/orm.txt
- https://www.prisma.io/docs/llms/orm-v7.txt
- https://www.prisma.io/docs/llms/orm-v6.txt
- https://www.prisma.io/docs/llms/postgres.txt
- https://www.prisma.io/docs/llms/cli.txt
- https://www.prisma.io/docs/prisma-orm/release-status
- https://www.prisma.io/docs/orm/reference/transactions-and-runtime
- https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- https://www.prisma.io/docs/orm/migrations/editing-a-migration
- https://www.prisma.io/docs/orm/prisma-client/client-extensions
- https://www.prisma.io/docs/orm/prisma-client/client-extensions/query
- https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries
- https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
- https://www.prisma.io/docs/orm/overview/databases/database-drivers
- https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database
- https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations
- https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool
- https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/customizing-migrations
- https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production
- https://www.prisma.io/changelog.md
- https://www.prisma.io/changelog/2026-07-17

**Prisma GitHub / npm**
- https://github.com/prisma/prisma/issues/12735 — "Support for row-level security (RLS)", open, last updated 2025-10-10
- https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security — README.md, script.ts, package.json, docker-compose.yml, docker/init-app-db.sh, prisma/schema.prisma, prisma/migrations/20221211203153_row_level_security/migration.sql
- https://github.com/prisma/prisma/releases
- https://registry.npmjs.org/prisma — dist-tags: `latest` = 8.0.0-rc.14 (2026-09-12), `prev` = 7.10.0
