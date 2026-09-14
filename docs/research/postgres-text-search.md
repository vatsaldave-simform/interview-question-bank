# Postgres text search for the interview question bank

Research date: **2026-09-14**. Versions checked at that date:

| Thing | Version observed | How I know |
| --- | --- | --- |
| PostgreSQL "current" docs | **18** (18.6 released 2026-08-13; 19 is in Beta 3) | The banner and breadcrumb on every `postgresql.org/docs/current/` page I read |
| Prisma ORM stable | **7.10.0** (`prisma`, `@prisma/client`) | [Release status](https://www.prisma.io/docs/prisma-orm/release-status) |
| Prisma ORM 8 | **release candidate** (`prisma` 8.0.0-rc.14, `@prisma/orm-postgres` 8.0.0-rc.10 as of 2026-09-12); GA expected October 2026 | [Release status](https://www.prisma.io/docs/prisma-orm/release-status) |

This repo has no `package.json` or `schema.prisma` yet (`backend/` and `frontend/` are empty), so everything below is written for **Prisma ORM 7**, which is the stable line, with a Prisma ORM 8 note wherever the answer differs. See [§7](#7-if-you-start-on-prisma-orm-8-instead).

---

## Verdict

- **Problem A (keyword search over `text` + `answerNotes`, combined with tag filters and a visibility predicate, one query, indexed):** a **stored generated `tsvector` column** over `coalesce(text,'') || ' ' || coalesce(answerNotes,'')` with a **GIN index** on it, queried with `websearch_to_tsquery('english', $1) @@ searchVector`, executed through **`$queryRaw`/TypedSQL** — *not* through Prisma's `search` filter.
- **Problem B (near-duplicate detection at submit time):** **`pg_trgm`** over the `text` column only, using the **`<->` distance operator with a `GIST (text gist_trgm_ops)` index** and `ORDER BY ... LIMIT n` (the documented KNN case), executed through `$queryRaw`/TypedSQL.

**Using one mechanism for both is a mistake.** Full-text search throws away the exact string — it stems, drops stop words, and stores an unordered bag of lexemes — so two questions that share topic words but are not duplicates score as a match, and a re-worded duplicate with different stems does not. Trigram similarity is the opposite: it measures literal character overlap of the whole string, which is what "is this a near-duplicate" means, but it has no notion of "matches the word *closure*" and degrades badly as a keyword search. Details and evidence in [§5](#5-the-verdict-in-full).

---

## 1. PostgreSQL native full-text search

### 1.1 `tsvector`, `tsquery`, `@@`

`@@` is the match operator between a `tsvector` (the document) and a `tsquery` (the query): `tsvector @@ tsquery`.
Source: [12.3. Controlling Text Search](https://www.postgresql.org/docs/current/textsearch-controls.html).

The four query-parsing functions, all quoted from the same page:

| Function | Behaviour | `'The Fat Rats'` becomes |
| --- | --- | --- |
| `to_tsquery([config,] text)` | input "must consist of single tokens separated by the `tsquery` operators `&` `\|` `!` `<->`, possibly grouped using parentheses". **Raises a syntax error on malformed input.** | `'fat' & 'rat'` (from `'The & Fat & Rats'`) |
| `plainto_tsquery([config,] text)` | normalizes like `to_tsvector`, then inserts `&` between surviving words. Does not recognize operators. | `'fat' & 'rat'` |
| `phraseto_tsquery([config,] text)` | like `plainto_tsquery` but inserts `<->` (FOLLOWED BY). | `'fat' <-> 'rat'` |
| `websearch_to_tsquery([config,] text)` | "alternative syntax suitable for raw user-supplied input. **Never raises syntax errors.**" Unquoted text → `&`; `"quoted text"` → `<->`; the word `or` → `\|`; a leading `-` → `!`; other punctuation ignored. | `'fat' & 'rat'` |

Documented `websearch_to_tsquery` examples, verbatim:

```sql
SELECT websearch_to_tsquery('english', '"supernovae stars" -crab');
-- 'supernova' <-> 'star' & !'crab'

SELECT websearch_to_tsquery('english', '"sad cat" or "fat rat"');
-- 'sad' <-> 'cat' | 'fat' <-> 'rat'
```

**For a search box fed by end users, `websearch_to_tsquery` is the only one of the four the docs describe as safe for raw input** ("never raises syntax errors"). `to_tsquery` will throw on a user typing `c++ &` or an unbalanced paren.

### 1.2 Indexing a concatenation of two columns

PostgreSQL 18's [12.2.2. Creating Indexes](https://www.postgresql.org/docs/current/textsearch-tables.html) gives both options and recommends one.

**Option 1 — expression index on `to_tsvector(...)`:**

```sql
CREATE INDEX pgweb_idx ON pgweb USING GIN (to_tsvector('english', body));
```

**Option 2 — stored generated column + GIN index (the recommended approach in the docs):**

```sql
ALTER TABLE pgweb
    ADD COLUMN textsearchable_index_col tsvector
               GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) STORED;

CREATE INDEX textsearch_idx ON pgweb USING GIN (textsearchable_index_col);
```

The docs' own stated advantages of the generated-column form:

> - Not necessary to explicitly specify the text search configuration in queries to use the index
> - Searches will be faster since `to_tsvector` calls won't need to be redone to verify index matches
> - The query can depend on `default_text_search_config`

Two further reasons that matter for this project:

- `coalesce(...)` is what makes a **nullable** `answerNotes` not blow the whole vector away (`NULL || ' ' || 'x'` is `NULL`). The docs' own example uses exactly this shape.
- With an **expression** index, "index expressions are relatively expensive to maintain, because the derived expression(s) must be computed for each row insertion and non-HOT update" — but they are "not recomputed during an indexed search, since they are already stored in the index" ([11.7. Indexes on Expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)). The generated column has the same write cost but is additionally readable and rankable without recomputation.

### 1.3 The immutability requirement — what breaks without `'english'::regconfig`

Two independent rules bite here.

**Rule 1 — index expressions must be immutable.** From [CREATE INDEX, Notes](https://www.postgresql.org/docs/current/sql-createindex.html):

> All functions and operators used in an index definition must be "immutable", that is, their results must depend only on their arguments and never on any outside influence (such as the contents of another table or the current time).

**Rule 2 — generation expressions must be immutable.** From [5.4. Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html):

> The generation expression can only use immutable functions and cannot use subqueries or reference anything other than the current row in any way.

The one-argument `to_tsvector(text)` is **not** immutable, because it reads the `default_text_search_config` GUC. [12.2.2](https://www.postgresql.org/docs/current/textsearch-tables.html) states the requirement and the reason explicitly:

> The 2-argument version of `to_tsvector` must be used. Only text search functions that specify a configuration name can be used in expression indexes. This is because the index contents must be unaffected by `default_text_search_config`. If they were affected, the index contents might be inconsistent because different entries could contain `tsvector`s that were created with different text search configurations, and there would be no way to guess which was which. It would be impossible to dump and restore such an index correctly.

**What breaks without the config argument:**

1. `CREATE INDEX ... (to_tsvector(body))` and `ADD COLUMN ... GENERATED ALWAYS AS (to_tsvector(body)) STORED` are both **rejected outright** by the two immutability rules above.
2. Even if you have a correct two-argument index, a query written with the one-argument form **silently will not use it**. Verbatim from 12.2.2:
   - `WHERE to_tsvector('english', body) @@ 'a & b'` *can* use the index
   - `WHERE to_tsvector(body) @@ 'a & b'` *cannot* use the index
3. The one-argument form's behaviour is environment-dependent: `default_text_search_config`'s "built-in default is `pg_catalog.simple`, but `initdb` will initialize the configuration file with a setting that corresponds to the chosen `lc_ctype` locale, if a configuration matching that locale can be identified" ([19.11. Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html)). `simple` does no stemming and drops no stop words. So the same query can behave differently on your laptop and on the production server. **This is exactly the trap Prisma's `search` filter falls into — see [§2.3](#23-what-search-actually-generates).**

### 1.4 GIN vs GiST for this workload

From [12.9. Preferred Index Types for Text Search](https://www.postgresql.org/docs/current/textsearch-indexes.html) (PostgreSQL 18), verbatim:

> **GIN indexes are the preferred text search index type.** As inverted indexes, they contain an index entry for each word (lexeme), with a compressed list of matching locations. Multi-word searches can find the first match, then use the index to remove rows that are lacking additional words. GIN indexes store only the words (lexemes) of `tsvector` values, and not their weight labels. Thus a table row recheck is needed when using a query that involves weights.

> A GiST index is **lossy**, meaning that the index might produce false matches, and it is necessary to check the actual table row to eliminate such false matches. […] GiST indexes are lossy because each document is represented in the index by a fixed-length signature. […] The default signature length (when `siglen` is not specified) is 124 bytes, the maximum signature length is 2024 bytes.

> **Lossiness causes performance degradation due to unnecessary fetches of table records that turn out to be false matches.** Since random access to table records is slow, this limits the usefulness of GiST indexes.

> Note that GIN index build time can often be improved by increasing `maintenance_work_mem`, while GiST index build time is not sensitive to that parameter.

**Note on a commonly repeated claim:** the "GIN is about three times slower to build than GiST, and up to three times faster to search" comparison table that circulates widely is **not present in the PostgreSQL 18 text** of 12.9 — I read the page in full and it is not there. Treat any numeric GIN-vs-GiST ratio as unsourced unless you find it in the docs for the version you are running. The qualitative conclusion — GIN preferred for `tsvector` — *is* in PG 18.

**Verdict for problem A: GIN.** At ~10,000 rows either index is fast; GIN is the documented default, is not lossy, and the build cost that is GIN's only stated downside is irrelevant at this size.

### 1.5 Documented `tsvector` limits (sanity check for an answer-notes blob)

From [12.11. Limitations](https://www.postgresql.org/docs/current/textsearch-limitations.html):

- length of each lexeme < 2 kB
- length of a `tsvector` (lexemes + positions) < **1 MB**
- position values in `tsvector` must be ≤ **16,383** — i.e. beyond roughly the 16,383rd token, positions stop being recorded, which degrades `ts_rank_cd` and phrase search on very long documents
- no more than 256 positions per lexeme
- number of nodes in a `tsquery` < 32,768

Interview questions plus answer notes will not come close to 1 MB, so none of these are a practical constraint here. The 16,383-position limit is the one to remember if `answerNotes` ever becomes a long-form document.

---

## 2. Prisma's own full-text search support (PostgreSQL)

### 2.1 Status: still Preview, after being *demoted* for PostgreSQL in Prisma 6

- The flag is **`fullTextSearchPostgres`**. Not `fullTextSearch` (that is MySQL's, and is GA), not `fullTextIndex` (that is the `@@fulltext` schema attribute for MySQL/MongoDB, GA since 6.0.0).
- Prisma 6.0.0 release notes, verbatim: *"The `fullTextSearch` Preview feature is promoted to General Availability **only for MySQL**. This means that if you're using PostgreSQL and currently make use of this Preview feature, you now need to use the new `fullTextSearchPostgres` Preview feature."* ([prisma/orm 6.0.0 release notes](https://github.com/prisma/orm/releases/tag/6.0.0))
- The Prisma ORM 7 Preview-features table still lists `fullTextSearchPostgres` under **"Currently active Preview features"**, released into Preview in 6.0.0. It is *not* in the "promoted to General Availability" table. ([Preview features](https://www.prisma.io/docs/orm/v7/reference/preview-features/client-preview-features))
- The feedback issue [prisma/orm#25773](https://github.com/prisma/orm/issues/25773) says *"GA planned for September 2025 - February 2026"*. That window has passed; the feature is still Preview as of Prisma 7.10.0 (2026-09).
- The Prisma feature matrix rates *"Fuzzy/Phrase full text search"* as supported by the **database** but **"Not yet"** for Prisma schema, Prisma Client, and Prisma Migrate. ([Database features matrix](https://www.prisma.io/docs/orm/v7/reference/database-features))

Enabling it:

```prisma
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["fullTextSearchPostgres"]
}
```

### 2.2 The API surface

```ts
// filter
const posts = await prisma.post.findMany({
  where: { body: { search: "cat | dog" } },
});

// relevance ordering
const posts = await prisma.post.findMany({
  orderBy: { _relevance: { fields: ["title"], search: "database", sort: "desc" } },
});
```

([Full-text search](https://www.prisma.io/docs/orm/v7/prisma-client/queries/full-text-search).) The [Prisma Client reference for `search`](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference#search) documents `"cat | dog"`, `"cat & dog"`, and `"!cat"` — i.e. **raw `tsquery` operator syntax is handed straight through to the database.**

### 2.3 What `search` actually generates

The docs never say. The engine source does. From `quaint/src/visitor/postgres.rs` in [prisma/prisma-engines](https://github.com/prisma/prisma-engines) (`main`; the file was last touched 2026-01-28):

```rust
fn visit_text_search(&mut self, text_search: TextSearch<'a>) -> visitor::Result {
    self.surround_with("to_tsvector(concat_ws(' ', ", "))", |s| { /* columns */ })
}

fn visit_matches(&mut self, left: Expression<'a>, right: Expression<'a>, not: bool) -> visitor::Result {
    self.visit_expression(left)?;
    self.write(" @@ ")?;
    self.surround_with("to_tsquery(", ")", |s| s.visit_expression(right))
}
```

and the doctest assertions in [`quaint/src/ast/function/search.rs`](https://github.com/prisma/prisma-engines/blob/main/quaint/src/ast/function/search.rs), verbatim:

```
SELECT "recipes".* FROM "recipes"
WHERE to_tsvector(concat_ws(' ', "name","ingredients")) @@ to_tsquery($1)
```

```
SELECT "recipes".* FROM "recipes"
WHERE ts_rank(to_tsvector(concat_ws(' ', "name","ingredients")), to_tsquery($1)) > $2
```

So, definitively:

1. **`to_tsvector` is called with ONE argument** — no `'english'::regconfig`. Per [§1.3](#13-the-immutability-requirement--what-breaks-without-englishregconfig), a query in this shape **cannot use** a `GIN (to_tsvector('english', …))` expression index, and cannot use a generated-column index either (it does not reference the column at all). The vector is recomputed for **every row on every query** — a sequential scan with a `to_tsvector` call per row, every time.
2. **The query function is `to_tsquery`, the strict one.** User input containing `(`, unbalanced quotes, a bare `&`, `c++`, or a trailing `-` produces a PostgreSQL syntax error, surfaced as a Prisma error. Prisma does **not** escape or sanitize it — it is bound as a parameter, which prevents SQL injection but does nothing about tsquery grammar. There is no option to switch to `websearch_to_tsquery` / `plainto_tsquery`.
3. **The text search configuration comes from the server's `default_text_search_config`**, so stemming/stop-word behaviour is environment-dependent (see [§1.3](#13-the-immutability-requirement--what-breaks-without-englishregconfig) point 3).
4. `_relevance` generates `ts_rank(to_tsvector(concat_ws(' ', …)), to_tsquery($1))` — same one-argument problem, plus `ts_rank` on a recomputed vector.
5. **Multi-column:** `concat_ws(' ', …)` shows the SQL *shape* supports several columns, and the query-compiler filter visitor does collect a column list (`query-compiler/query-builders/sql-query-builder/src/filter/visitor.rs`). But in the documented **Prisma Client API**, `search` sits on a single string field (`where: { body: { search } }`); the documented multi-field surface is `orderBy._relevance.fields`, which is ordering, not filtering. To filter on two columns you would write `OR: [{ text: { search } }, { answerNotes: { search } }]`, which produces **two separate unindexed `to_tsvector` calls** rather than one vector over the concatenation.

**Conclusion: Prisma's `search` filter cannot satisfy problem A's "must be indexed" requirement at all.** Not "it is slower" — the generated SQL is structurally incapable of using a text-search index on PostgreSQL. Do not use it.

### 2.4 There is no `@@fulltext` for PostgreSQL

`@@fulltext` and the `fullTextIndex` feature are documented as *"Full text indexes in **MySQL and MongoDB**"* ([Indexes](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/indexes)). PostgreSQL is not in scope.

---

## 3. Prisma escape hatches

### 3.1 `$queryRaw` and `Prisma.sql`

`$queryRaw` is a tagged template; interpolated values become **prepared-statement parameters**, so they are injection-safe:

```ts
const email = "emelie@prisma.io";
const result = await prisma.$queryRaw`SELECT * FROM User WHERE email = ${email}`;
// or, equivalently:
const result = await prisma.$queryRaw(Prisma.sql`SELECT * FROM User WHERE email = ${email}`);
```

Signature: `$queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): PrismaPromise<T>`.

Documented constraints ([Raw queries](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries)):

- Only **one statement per call** — `select 1; select 2;` will not work.
- Template variables **cannot** be identifiers (table/column names) or SQL keywords, and **cannot** appear inside a SQL string literal.
- Helpers come from [sql-template-tag](https://github.com/blakeembrey/sql-template-tag): `Prisma.sql`, `Prisma.join(ids)`, `Prisma.empty`, `Prisma.raw`. `Prisma.join` is what you use for `IN (${Prisma.join(ids)})`.
- `Prisma.raw` interpolates **unescaped** text — it is the injection hole. Never pass user input to it.
- **`Unsupported` columns must be cast before they can be selected**: `SELECT location::text FROM Country`. For our design this is fine — the `tsvector` column is only ever used in a `WHERE`, never selected.
- PostgreSQL cannot `PREPARE` an `ALTER` statement, so `$executeRaw` fails on it; the documented workaround is `$executeRawUnsafe`. (Relevant in [§4.4](#44-the-threshold-is-a-guc-not-an-argument), where `SET` has the same problem.)

If you build SQL in pieces, do it with `Prisma.sql` fragments, never string concatenation — the docs have a whole section on this ("Building raw queries elsewhere or in stages").

### 3.2 TypedSQL — note the actual method name

The task brief called it `$queryRawTypedSql`. **That name does not exist.** The feature is **TypedSQL**, the preview flag is **`typedSql`** (Preview since 5.19.0), and the client method is **`$queryRawTyped`** ([TypedSQL](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/typedsql)).

```prisma
generator client {
  provider        = "prisma-client"
  previewFeatures = ["typedSql"]
  output          = "../src/generated/prisma"
}
```

```sql
-- prisma/sql/searchQuestions.sql
-- @param {String} $1:query
-- @param {Boolean} $2:visibleOnly
SELECT q.id, q."text"
FROM "Question" q
WHERE q."searchVector" @@ websearch_to_tsquery('english', $1)
  AND (NOT $2 OR q."isPublished")
```

```ts
import { searchQuestions } from "./generated/prisma/sql";
const rows = await prisma.$queryRawTyped(searchQuestions(q, true));
```

Documented limitations of TypedSQL:

- **Requires a live database connection** at `prisma generate --sql` time (it uses the connection string from `prisma.config.ts`). That means CI and Docker builds need a reachable database or a pre-generated client.
- SQL files live in `prisma/sql/`; filenames must be valid JS identifiers and must not start with `$`. Since Prisma 6.12.0 the folder is configurable via `typedSql.path` in `prisma.config.ts`.
- **No dynamic columns.** A query whose SELECT list varies at runtime must fall back to `$queryRawUnsafe`.
- Manual `-- @param {Type} $N:alias` annotations are supported (and required for MySQL < 8 / SQLite); array parameters cannot be manually annotated.
- Array params work on PostgreSQL via `= ANY($1)`.

**Recommendation for this repo:** both problems' queries have a *fixed* column list and a fixed shape, so TypedSQL is a good fit and gives you real types. If the CI-needs-a-database constraint is unacceptable, `$queryRaw` with a hand-written `type` is the fallback and is equally safe.

### 3.3 `Unsupported("tsvector")` in `schema.prisma`

`Unsupported` exists since Prisma 2.17.0 ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference#unsupported)). Documented remarks:

- Fields with `Unsupported` types **are not available in the generated client**.
- **If a model contains a *required* `Unsupported` field, `create()`, `update()` and `upsert()` are not available on that model.** → **Always declare it optional: `Unsupported("tsvector")?`.** Getting this wrong silently removes your write API.
- `prisma migrate dev` / `db push` will create the column in the database.

### 3.4 Adding the generated column and the GIN index via a custom migration

The documented pattern for anything PSL cannot express ([Unsupported database features (Migrate)](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features), [Customizing migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations)):

```bash
npx prisma migrate dev --create-only   # write the migration, do not apply
# edit prisma/migrations/<ts>_<name>/migration.sql
npx prisma migrate dev                 # apply it
git add prisma/migrations              # commit it
```

Two things I could **not** find any PSL syntax for, having searched the full [Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference) and the [Indexes](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/indexes) page:

- **stored generated columns** (`GENERATED ALWAYS AS (...) STORED`). `@default(dbgenerated(...))` is a column *default*, which is a different thing — it is evaluated once at insert and is not maintained on update. There is no `@generated` attribute. → must be hand-written SQL in a migration.
- **expression indexes.** Confirmed by Prisma's own docs: *"Expression indexes"* is on the list of database features that `prisma db pull` surfaces only as a **warning**, linking to the still-open [prisma/orm#2504](https://github.com/prisma/orm/issues/2504) ([Introspection warnings for unsupported features](https://www.prisma.io/docs/orm/v7/prisma-schema/introspection#introspection-warnings-for-unsupported-features)).

**What Prisma *can* express**, and this matters for problem B: a GIN/GiST index with an **arbitrary operator class** via `raw()`:

```prisma
@@index([text(ops: raw("gin_trgm_ops"))], type: Gin)
```

The Indexes page documents `raw("other")` as a valid entry in the supported-operator-class tables for GIN, GiST and SP-GiST: *"If the operator class requires the field type to be of a type Prisma ORM does not yet support, using the `raw` function with a string input allows you to use these operator classes without validation."* So a **trigram index on a plain `String` column is fully modelled by Prisma** — no custom migration needed for the index itself.

### 3.5 What `migrate dev` preserves vs. drops — the part you must get right

The documented algorithm ([About the shadow database](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database)):

*Drift detection:* create a fresh shadow database → **re-run the entire existing migration history** → introspect the shadow DB to get the "current state" Prisma schema → compare that to the **development database**. A mismatch is reported as schema drift, and `migrate dev` then offers to **reset** (dropping all data).

*New migration generation:* compare **the end state of the existing migration history** against **the target schema computed from `schema.prisma`**, and emit the SQL steps that get from one to the other.

The consequences, which the docs state only implicitly:

| Where the object lives | What happens |
| --- | --- |
| Created by a committed migration **and** representable in `schema.prisma` | Preserved. History end state and target schema agree; the diff is empty. |
| Created by a committed migration, **not** in `schema.prisma` | **At risk.** It is present in the history end state but absent from the target schema, so the next `migrate dev` diff can generate a `DROP`. |
| Created by hand outside any migration (psql, a GUI) | **Reported as drift** on the next `migrate dev`, which prompts a reset — and the shadow database will not have it either, so the migration would fail there anyway. The docs warn about exactly this for extensions: *"Do not activate extensions outside a migration file if you use Prisma Migrate. The shadow database requires the same extensions."* |

**Therefore: the `tsvector` column must appear in `schema.prisma` as `Unsupported("tsvector")?` even though it is created by hand-edited SQL.** That way the migration-history end state and the target schema agree and Prisma has no reason to drop it.

> **Unconfirmed.** I could not find documentation stating whether Prisma's introspection round-trip distinguishes a *stored generated* `tsvector` column from a plain `tsvector` column, nor whether `@@index([searchVector], type: Gin)` is accepted on an `Unsupported` field. This is the single highest-value thing to verify before committing to the design — see [§8](#8-open--unconfirmed-questions) for the exact commands.

---

## 4. pg_trgm

All quotations below are from [F.35. pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) (PostgreSQL 18).

### 4.1 What a trigram is, exactly

> A trigram is a group of three consecutive characters taken from a string.

> pg_trgm ignores non-word characters (non-alphanumerics) when extracting trigrams from a string. Each word is considered to have **two spaces prefixed and one space suffixed**. For example, the set of trigrams in the string "cat" is `" c"`, `" ca"`, `"cat"`, and `"at "`.

### 4.2 Functions

| Function | Description (verbatim) |
| --- | --- |
| `similarity(text, text) → real` | "Returns a number that indicates how similar the two arguments are. The range of the result is zero … to one." |
| `word_similarity(text, text) → real` | "Returns a number that indicates the greatest similarity between the set of trigrams in the first string and **any continuous extent of an ordered set of trigrams in the second string**." |
| `strict_word_similarity(text, text) → real` | "Same as `word_similarity`, but forces extent boundaries to match **word boundaries**." |
| `show_trgm(text) → text[]` | debugging only |
| `set_limit` / `show_limit` | **Deprecated**; use `SET` / `SHOW pg_trgm.similarity_threshold` |

The docs' own worked example, which is the key to [§4.5](#45-behaviour-on-long-text-vs-a-single-sentence):

```
# SELECT word_similarity('word', 'two words');
 0.8
# SELECT strict_word_similarity('word', 'two words'), similarity('word', 'words');
 0.571429 | 0.571429
```

> Thus, the `strict_word_similarity` function is useful for finding the similarity to whole words, while `word_similarity` is more suitable for finding the similarity for parts of words.

### 4.3 Operators

| Operator | Meaning | Threshold GUC |
| --- | --- | --- |
| `a % b` | similarity > threshold | `pg_trgm.similarity_threshold` (default **0.3**) |
| `a <% b` | word similarity > threshold | `pg_trgm.word_similarity_threshold` (default **0.6**) |
| `a %> b` | commutator of `<%` | — |
| `a <<% b` | strict word similarity > threshold | `pg_trgm.strict_word_similarity_threshold` (default **0.5**) |
| `a %>> b` | commutator of `<<%` | — |
| `a <-> b` | **distance** = `1 - similarity()` | — |
| `a <<-> b` / `a <->> b` | `1 - word_similarity()` and its commutator | — |
| `a <<<-> b` / `a <->>> b` | `1 - strict_word_similarity()` and its commutator | — |

All three thresholds must be between 0 and 1.

### 4.4 The threshold is a GUC, not an argument

This is the single most surprising operational fact: `%`, `<%` and `<<%` read a **session setting**, not a literal in the query. You cannot write `text % $1 WITH 0.45`. Options:

- `SET LOCAL pg_trgm.similarity_threshold = 0.45;` inside a transaction — but PostgreSQL cannot `PREPARE` a `SET`, the same limitation Prisma documents for `ALTER`, so it must go through `$executeRawUnsafe` (with a hard-coded literal — never user input) inside `prisma.$transaction(...)`.
- `ALTER DATABASE … SET pg_trgm.similarity_threshold = 0.45;` in a migration, so it is a deployment fact rather than a per-query one.
- **Or sidestep it entirely with the distance operator and `ORDER BY … LIMIT n`** (next section), which takes no threshold. This is what I recommend for problem B.

### 4.5 Index support: which operators, and the KNN case

Both operator classes support the similarity operators plus LIKE/ILIKE/regex/`=`:

> The pg_trgm module provides GiST and GIN index operator classes […] These index types support the above-described similarity operators, and additionally support trigram-based index searches for `LIKE`, `ILIKE`, `~`, `~*` and `=` queries. The similarity comparisons are case-insensitive in a default build of pg_trgm. Inequality operators are not supported. Note that those indexes may not be as efficient as regular B-tree indexes for equality operator.

```sql
CREATE INDEX trgm_idx ON test_trgm USING GIST (t gist_trgm_ops);
CREATE INDEX trgm_idx ON test_trgm USING GIST (t gist_trgm_ops(siglen=32));  -- default siglen 12, range 1..2024
CREATE INDEX trgm_idx ON test_trgm USING GIN  (t gin_trgm_ops);
```

**The one place they differ is the distance/KNN case**, and the docs say so twice, verbatim:

```sql
SELECT t, t <-> 'word' AS dist
  FROM test_trgm
  ORDER BY dist LIMIT 10;
```

> This can be implemented quite efficiently by **GiST** indexes, but **not by GIN** indexes. It will usually beat the first formulation when only a small number of the closest matches is wanted.

and again, for `<<->` and `<<<->`:

> This can be implemented quite efficiently by GiST indexes, but not by GIN indexes.

The docs' guidance on choosing: *"The choice between GiST and GIN indexing depends on the relative performance characteristics of GiST and GIN, which are discussed elsewhere."* — i.e. pg_trgm itself makes no blanket recommendation; the only hard rule is **KNN ⇒ GiST**.

Note also `gist_trgm_ops`'s `siglen` default here is **12 bytes**, not the 124 bytes of `tsvector_ops`. Longer signatures are more precise but larger.

### 4.6 Behaviour on long text vs. a single sentence

**There is no documented length limit or explicit performance caveat for long strings in F.35.** I looked for one and it is not there. What *is* documented, and what determines the behaviour:

1. `similarity()` is **symmetric over the whole of both strings**. A 60-character question title compared against a 4 kB `answerNotes` blob shares at most ~60 trigrams out of thousands, so `similarity` is necessarily tiny — far below the 0.3 default threshold — **regardless of how obviously the title appears inside the blob**. That is arithmetic from the documented definition ("we can measure the similarity of two strings by counting the number of trigrams they share"), not a benchmark.
2. The docs implicitly acknowledge this by providing `word_similarity`, whose entire purpose is the asymmetric case: *"the greatest similarity between the set of trigrams in the first string and any continuous extent of an ordered set of trigrams in the second string"* — and: *"This function returns a value that can be approximately understood as the greatest similarity between the first string and any substring of the second string. However, this function does not add padding to the boundaries of the extent. Thus, the number of additional characters present in the second string is not considered."* The `word_similarity('word','two words') = 0.8` vs `similarity('word','words') = 0.571` example is exactly this contrast.
3. The documented performance lever that *does* exist is the number of distinct trigrams: for GiST, `siglen` trades index size against false-match rate; for LIKE/regex, *"a pattern with no extractable trigrams will degenerate to a full-index scan."*

**Practical rule for problem B: run trigram similarity against `text` only, never against `text || answerNotes`.** Concatenating the blob in dilutes the signal to noise, by the documented definition of `similarity()`. If you ever do want "is this title buried inside that answer", use `word_similarity` / `strict_word_similarity`, not `similarity`.

> **Unconfirmed.** Whether a GIN or GiST trigram index has a hard row-size limit on very long values, and at what length trigram extraction becomes a measurable write cost, are not addressed in F.35. If `text` is ever allowed to be very long, measure rather than assume.

---

## 5. The verdict in full

### 5.1 Problem A — keyword search across `text` + `answerNotes`, with tag and visibility filters, one indexed query

**Mechanism:** stored generated `tsvector` column + GIN index + `websearch_to_tsquery('english', …)`, run through `$queryRawTyped` (or `$queryRaw`).

**Migration** (`npx prisma migrate dev --create-only`, then hand-edit):

```sql
-- prisma/migrations/<ts>_question_search_vector/migration.sql

ALTER TABLE "Question"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce("text", '') || ' ' || coalesce("answerNotes", '')
    )
  ) STORED;

CREATE INDEX "Question_searchVector_idx" ON "Question" USING GIN ("searchVector");
```

**Schema** — the column must be declared so `migrate dev` does not try to drop it, and must be **optional** so `create`/`update`/`upsert` stay available:

```prisma
model Question {
  id           String                   @id @default(uuid())
  text         String
  answerNotes  String?
  isPublished  Boolean                  @default(false)
  searchVector Unsupported("tsvector")?   // maintained by the database; never written by the app
  tags         QuestionTag[]
}
```

**Query** — one statement, one plan, index-usable:

```sql
-- prisma/sql/searchQuestions.sql
-- @param {String} $1:query
-- @param {Boolean} $3:includeUnpublished
-- ($2 is text[]; TypedSQL does not accept manual annotations for array
--  arguments, so its type is inferred from the query.)
SELECT q.id,
       q."text",
       ts_rank(q."searchVector", tsq.q) AS rank
FROM   "Question" q,
       websearch_to_tsquery('english', $1) AS tsq(q)
WHERE  q."searchVector" @@ tsq.q
  AND  (q."isPublished" OR $3)
  AND  ( cardinality($2::text[]) = 0
         OR EXISTS (SELECT 1 FROM "QuestionTag" qt
                    WHERE qt."questionId" = q.id
                      AND qt."tagId" = ANY($2::text[])) )
ORDER BY rank DESC, q.id
LIMIT 50;
```

```ts
const rows = await prisma.$queryRawTyped(searchQuestions(userQuery, tagIds, isAdmin));
```

**Why each choice:**

- **Generated column, not expression index** — it is the form the PostgreSQL docs explicitly recommend, it avoids re-running `to_tsvector` to verify index matches, it lets `ts_rank` read the stored vector instead of rebuilding it, and it lets the query be written without repeating the regconfig.
- **`'english'` written explicitly** — mandatory for immutability ([§1.3](#13-the-immutability-requirement--what-breaks-without-englishregconfig)), and it makes behaviour identical on every machine.
- **`coalesce(...)`** — `answerNotes` is nullable; without it the whole vector becomes `NULL`.
- **GIN** — the documented preferred type for `tsvector`.
- **`websearch_to_tsquery`** — the only parser the docs describe as never raising syntax errors on raw user input. `to_tsquery` would turn `"c++ (advanced)"` into a 500.
- **Raw SQL, not Prisma `search`** — [§2.3](#23-what-search-actually-generates). This is not a preference; `search` generates SQL that cannot use any text-search index.

**Tradeoff:** the `tsvector` column costs write time on every insert/update of `text` or `answerNotes` and roughly the size of the lexeme set on disk, and you give up Prisma Client's typed `where` builder for this one query. At ~10,000 rows the alternative (letting Prisma seq-scan and recompute `to_tsvector` per row) would probably still *finish*, but it scales with row count × document length and gives you no ranking worth the name.

### 5.2 Problem B — near-duplicate detection at submission time

**Mechanism:** `pg_trgm` on `text` only, GiST trigram index, `<->` distance with `ORDER BY … LIMIT`.

**Migration:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

(or declare it in `schema.prisma` with the `postgresqlExtensions` preview feature — see below). **It must be activated inside a migration**, because the shadow database needs it too.

**Index — fully expressible in PSL, so Prisma manages it:**

```prisma
generator client {
  provider        = "prisma-client"
  previewFeatures = ["postgresqlExtensions", "typedSql"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pg_trgm]
}

model Question {
  // ...
  @@index([text(ops: raw("gist_trgm_ops"))], type: Gist)
}
```

**Query — the documented KNN form, no threshold GUC needed:**

```sql
-- prisma/sql/findNearDuplicates.sql
-- @param {String} $1:candidateText
SELECT id,
       "text",
       "text" <-> $1 AS distance
FROM   "Question"
ORDER  BY distance
LIMIT  5;
```

```ts
const candidates = await prisma.$queryRawTyped(findNearDuplicates(submitted.text));
const likelyDuplicates = candidates.filter((c) => c.distance <= 0.55); // tune on real data
```

**Why each choice:**

- **GiST, not GIN** — the docs state twice that `ORDER BY t <-> 'x' LIMIT n` "can be implemented quite efficiently by GiST indexes, but not by GIN indexes", and that it "will usually beat the first formulation when only a small number of the closest matches is wanted". Top-5 near-duplicates is precisely that case.
- **`<->` instead of `%`** — `%` requires setting `pg_trgm.similarity_threshold`, a session GUC that PostgreSQL will not let you `PREPARE`, which forces `$executeRawUnsafe` inside a transaction. `<->` takes the cut-off out of SQL entirely and lets you tune it in TypeScript against real data. It also always returns something to show the submitter, ranked, which is the better UX for "did you mean this existing question?".
- **`text` only, not `text || answerNotes`** — [§4.6](#46-behaviour-on-long-text-vs-a-single-sentence). A new submission's near-duplicate is a near-duplicate of the *question*, and concatenating a long blob dilutes `similarity()` toward zero by definition.

**Tradeoff:** GiST is lossy and the trigram signature default is only 12 bytes, so it will fetch some heap rows that turn out not to be close; raise `siglen` if that ever shows up in `EXPLAIN`. Trigram similarity is also purely lexical — it will not catch a duplicate that is reworded with different vocabulary. If that becomes a requirement, that is an embeddings problem (pgvector), not a pg_trgm one.

**If you would rather set the threshold once and use `%` with a GIN index**, that also works and is faster for a pure boolean "are there any duplicates" check — but then you lose ordered top-N, which is what you want to *show* the submitter.

### 5.3 Why one mechanism for both is a mistake

Both directions fail, for reasons that are visible in the documented semantics:

**Full-text search for duplicate detection (A's mechanism applied to B).** `to_tsvector` "parses and normalizes" — it stems tokens and discards stop words — and the result is a set of lexemes with positions, not the string. So:
- Two genuinely different questions about the same subject share most of their content lexemes and will be "matched" at any threshold loose enough to catch real duplicates. `ts_rank` gives a score, but it is a relevance score for *a query*, not a symmetric distance between *two documents*; there is no documented notion of "these two `tsvector`s are 92% the same".
- Conversely, a duplicate reworded with the same words in a different order matches *identically* to one in the original order (unless you use phrase operators), so word order — a strong duplicate signal — is invisible.

**Trigram similarity for keyword search (B's mechanism applied to A).** `similarity()` compares whole strings, so a one-word query against a multi-sentence question has a similarity near zero by construction ([§4.6](#46-behaviour-on-long-text-vs-a-single-sentence)). You would have to switch to `word_similarity`/`<%`, which is closer, but:
- trigram matching has **no stemming** — searching `closure` does not find `closures` in the way an `english` `tsvector` does (`to_tsquery('english','Rats')` → `'rat'`), and searching `run` matches the substring in `running`, `prune` and `runt` alike;
- there is **no stop-word handling**, so "the" and "a" contribute trigrams;
- there is **no query language** — no AND/OR/NOT/phrase, whereas `websearch_to_tsquery` gives you all four for free;
- the docs' own [F.35.5 Text Search Integration](https://www.postgresql.org/docs/current/pgtrgm.html) section positions pg_trgm as a **complement** to full-text search — specifically for spelling suggestions on words FTS failed to match — not a replacement for it.

The two problems are asking different questions. A asks "does this document contain these concepts", which is what an inverted lexeme index answers. B asks "how close are these two strings", which is what a character-n-gram distance answers. Running both mechanisms costs you one extra index on a 10,000-row table.

---

## 6. Combining a full-text predicate with equality and join predicates

**Yes, they compose — via a bitmap AND.** From [11.5. Combining Multiple Indexes](https://www.postgresql.org/docs/current/indexes-bitmap-scans.html) (PostgreSQL 18), verbatim:

> A single index scan can only use query clauses that use the index's columns with operators of its operator class and are joined with AND. […] PostgreSQL has the ability to combine multiple indexes (including multiple uses of the same index) to handle cases that cannot be implemented by single index scans. The system can form AND and OR conditions across several index scans. […] if we have separate indexes on x and y, one possible implementation of a query like `WHERE x = 5 AND y = 6` is to use each index with the appropriate query clause and then AND together the index results to identify the result rows.

> To combine multiple indexes, the system scans each needed index and prepares a bitmap in memory giving the locations of table rows that are reported as matching that index's conditions. The bitmaps are then ANDed and ORed together as needed by the query. Finally, the actual table rows are visited and returned. **The table rows are visited in physical order, because that is how the bitmap is laid out; this means that any ordering of the original indexes is lost, and so a separate sort step will be needed if the query has an `ORDER BY` clause.** For this reason, and because each additional index scan adds extra time, **the planner will sometimes choose to use a simple index scan even though additional indexes are available**.

Three consequences for the problem-A query:

1. A GIN index on `searchVector` and a btree index on, say, `isPublished` **can** be combined into a `BitmapAnd`. They do not need to be one index.
2. **`ORDER BY rank DESC` will always cost a sort**, because a bitmap scan returns rows in heap order. That is fine at 10,000 rows and inherent to ranked FTS; a `tsvector` GIN index cannot return rows in rank order in any case (ranking needs the heap tuple or at least the stored vector).
3. The planner may well decide the GIN scan alone is selective enough and apply the tag/visibility predicates as filters on the heap fetch. At this table size that is usually the right call. **Do not add speculative indexes; run `EXPLAIN (ANALYZE, BUFFERS)` on the real query against a realistically-sized table and add indexes only where the plan shows a problem.** At 10,000 rows PostgreSQL may legitimately prefer a sequential scan over any of them, which is not a bug.

A **btree index cannot be merged into the GIN index** as a multicolumn index — `gin` does not have btree operator classes for ordinary scalar equality in the default distribution (the `btree_gin` contrib module exists for exactly this, but I did not verify its behaviour for this workload, so treat that as unexplored). Separate indexes plus bitmap AND is the documented, supported composition.

---

## 7. If you start on Prisma ORM 8 instead

Prisma ORM 8 is a **release candidate** (GA expected October 2026) and a ground-up rewrite. Relevant differences:

- **`Prisma.sql`, `Prisma.join`, `Prisma.raw`, `Prisma.empty`, and TypedSQL are all "not available"** ([Coming from Prisma ORM 7](https://www.prisma.io/docs/orm/coming-from-prisma-orm-7#not-available-yet)). The replacement is the `db.raw.sql` tagged template plus `fns.raw` fragments inside the SQL query builder ([Raw queries reference](https://www.prisma.io/docs/orm/reference/raw-queries)). Interpolated values become parameters; *"A column or table name cannot be interpolated as a string, because a string becomes a parameter."*
- **There is no `search` filter or `_relevance` ordering documented anywhere in the ORM 8 tree.** Full-text search is now positioned as an **extension**: `@prisma/orm-extension-paradedb` adds "BM25 full-text search indexes" and is marked **experimental** (*"ParadeDB supports the `key_field` index option only so far"*) ([Using extensions](https://www.prisma.io/docs/orm/extensions/using-extensions)). ParadeDB is a third-party PostgreSQL extension, not native `tsvector`.
- Migrations are **TypeScript you own**, with a documented drop-to-raw-SQL path ([Editing a migration](https://www.prisma.io/docs/orm/migrations/editing-a-migration)).
- Requires Node.js ≥ 22.18 (or ≥ 24.11 on the 24 line) and TypeScript ≥ 5.9.

**Recommendation:** build on **Prisma ORM 7** (`"prisma": "^7"`, `"@prisma/client": "^7"`, both pinned in `package.json`). Note the trap the docs flag: *"`npm install prisma` and `npx prisma` now give you the Prisma ORM 8 command-line tool. It does not read `schema.prisma` and has no `generate`, `migrate dev`, or `db push` commands."* Use `npx prisma@7` in CI and one-off commands. Prisma ORM 7 gets bug fixes and security updates for 18 months after ORM 8 GA.

The database-side design in this document is **unaffected by the Prisma version** — the generated column, the GIN index, the trigram index and both queries are plain SQL. Only the escape hatch that executes them changes.

---

## 8. Open / unconfirmed questions

Each of these is something I could not settle from primary sources. None of them changes the recommended shape; all of them are cheap to answer with one command against a scratch database.

1. **Does Prisma Migrate treat a stored generated `tsvector` column as drift?** `Unsupported("tsvector")?` is documented, but nothing states whether introspection distinguishes `GENERATED ALWAYS AS (...) STORED` from a plain `tsvector` column. **Verify:** apply the migration, then run `npx prisma@7 migrate dev --create-only` and read the generated SQL — it must be empty. Repeat after `npx prisma@7 migrate reset`.
2. **Does PSL accept `@@index([searchVector], type: Gin)` on an `Unsupported` field?** The Indexes page notes that "for fields with types that are not supported by the object syntax (such as `Unsupported` …), use `raw()` instead" — but that remark is in the *partial index `where`* section, not the index-field section. If PSL rejects it, the GIN index has to stay in the migration only, which re-opens question 1 for the index. **Verify:** add the attribute and run `npx prisma@7 validate`.
3. **Is `ops: raw("gist_trgm_ops")` with `type: Gist` accepted on a plain `String` field?** The docs document `raw("other")` as a table entry and say it skips validation, but give no worked example for trigram opclasses. **Verify:** `npx prisma@7 migrate dev --create-only` and read the emitted `CREATE INDEX`.
4. **Whether `websearch_to_tsquery` exists in the PostgreSQL version you will actually deploy on.** I read the PostgreSQL **18** docs. I did not verify which release introduced it. **Verify:** `SELECT websearch_to_tsquery('english','test');` on the target server.
5. **Trigram behaviour on long values** — no documented length limit or performance caveat in F.35 ([§4.6](#46-behaviour-on-long-text-vs-a-single-sentence)). Unverified.
6. **"GIN index scans always return a bitmap."** Widely stated; I could not locate it in the PostgreSQL 18 docs (`gin-implementation.html` does not resolve at that URL in the current tree). The bitmap-AND composition claim in [§6](#6-combining-a-full-text-predicate-with-equality-and-join-predicates) rests on 11.5, which *is* sourced; this narrower claim is **unconfirmed**.
7. **`btree_gin`** — would let scalar equality columns join the GIN index as a true multicolumn index, removing the bitmap AND. Not investigated.
8. **Whether Prisma ORM 8 will restore a native PostgreSQL `search` filter**, or leave full-text search to extensions permanently. Nothing in the ORM 8 docs says either way. **Unconfirmed.**
9. **The right distance cut-off for problem B.** `pg_trgm`'s defaults (0.3 similarity, i.e. 0.7 distance) are for spelling correction on single words, not for whole-sentence duplicate detection. This must be tuned against real submissions; no source can supply the number.

---

## Sources

Every URL below was fetched and read for this document.

### PostgreSQL 18 official documentation (postgresql.org)

- <https://www.postgresql.org/docs/current/textsearch-controls.html> — 12.3. Controlling Text Search (`to_tsquery`, `plainto_tsquery`, `phraseto_tsquery`, `websearch_to_tsquery`, `@@`, `ts_rank`, `ts_rank_cd`)
- <https://www.postgresql.org/docs/current/textsearch-tables.html> — 12.2. Tables and Indexes (generated-column recipe, two-argument requirement)
- <https://www.postgresql.org/docs/current/textsearch-indexes.html> — 12.9. Preferred Index Types for Text Search (GIN vs GiST)
- <https://www.postgresql.org/docs/current/textsearch-limitations.html> — 12.11. Limitations
- <https://www.postgresql.org/docs/current/pgtrgm.html> — F.35. pg_trgm
- <https://www.postgresql.org/docs/current/indexes-expressional.html> — 11.7. Indexes on Expressions
- <https://www.postgresql.org/docs/current/indexes-bitmap-scans.html> — 11.5. Combining Multiple Indexes
- <https://www.postgresql.org/docs/current/indexes-types.html> — 11.2. Index Types
- <https://www.postgresql.org/docs/current/sql-createindex.html> — CREATE INDEX (immutability rule, Notes)
- <https://www.postgresql.org/docs/current/ddl-generated-columns.html> — 5.4. Generated Columns (immutability restriction)
- <https://www.postgresql.org/docs/current/runtime-config-client.html> — 19.11. Client Connection Defaults (`default_text_search_config`)
- <https://www.postgresql.org/docs/current/datatype-textsearch.html> — 8.11. Text Search Types

### Prisma documentation (prisma.io/docs)

- <https://www.prisma.io/docs/llms.txt> and <https://www.prisma.io/docs/llms/orm.txt>, <https://www.prisma.io/docs/llms/orm-v7.txt> — documentation indexes
- <https://www.prisma.io/docs/prisma-orm/release-status> — ORM 8 RC status, ORM 7 version pinning, support windows
- <https://www.prisma.io/docs/orm/v7/prisma-client/queries/full-text-search> — `fullTextSearchPostgres`, `search`, `_relevance`
- <https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference> — `search` and `_relevance` reference entries
- <https://www.prisma.io/docs/orm/v7/reference/preview-features/client-preview-features> — Preview vs GA tables
- <https://www.prisma.io/docs/orm/v7/reference/database-features> — feature matrix ("Fuzzy/Phrase full text search: Not yet")
- <https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries> — `$queryRaw`, `Prisma.sql`/`join`/`raw`/`empty`, injection prevention, `ALTER` limitation, `Unsupported` casting
- <https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/typedsql> — `typedSql`, `$queryRawTyped`, limitations
- <https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features> — `Unsupported`, `dbgenerated`
- <https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference> — `Unsupported` reference and remarks
- <https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/indexes> — `type: Gin`/`Gist`, `ops: raw("…")`, `@@fulltext` is MySQL/MongoDB only
- <https://www.prisma.io/docs/orm/v7/prisma-schema/introspection> — introspection warnings, "Expression indexes" unsupported
- <https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations> — `--create-only` workflow
- <https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features> — custom SQL in migrations
- <https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/native-database-functions> — extensions must be activated in a migration
- <https://www.prisma.io/docs/orm/v7/prisma-schema/postgresql-extensions> — `postgresqlExtensions`, `CREATE EXTENSION` in a migration
- <https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database> — drift detection and migration-generation algorithm
- <https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues> — reset-on-drift
- <https://www.prisma.io/docs/orm/extensions/using-extensions> — ORM 8 extension model, ParadeDB
- <https://www.prisma.io/docs/orm/reference/raw-queries> — ORM 8 `db.raw.sql` / `fns.raw`
- <https://www.prisma.io/docs/orm/coming-from-prisma-orm-7> — what ORM 8 does not have

### Prisma source and issue tracker (github.com)

- <https://github.com/prisma/prisma-engines/blob/main/quaint/src/ast/function/search.rs> — doctests asserting the exact generated SQL
- <https://github.com/prisma/prisma-engines/blob/main/quaint/src/visitor/postgres.rs> — `visit_text_search`, `visit_matches`, `visit_text_search_relevance`
- <https://github.com/prisma/prisma-engines/blob/main/query-compiler/query-builders/sql-query-builder/src/filter/visitor.rs> — how `search` filters reach the SQL builder
- <https://github.com/prisma/orm/releases/tag/6.0.0> — `fullTextSearch` GA for MySQL only; PostgreSQL moved to `fullTextSearchPostgres`
- <https://github.com/prisma/orm/issues/25773> — `fullTextSearchPostgres` Preview feedback issue ("GA planned for September 2025 - February 2026")
- <https://github.com/prisma/orm/issues/2504> — "Add support for Indexes on Expressions" (open since 2020)

### Secondary sources

None. Every claim above is sourced to postgresql.org, prisma.io/docs, or the Prisma GitHub organisation. Where no primary source exists, the claim is marked **unconfirmed** rather than filled in.
