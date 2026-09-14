# PROTOTYPE — combined-filter SQL shape

> **Throwaway.** This directory exists to answer one question and is not production code.
> It has no tests, no error handling and no abstractions. Once ADR-0011 is written, the
> only thing worth keeping here is the measurement itself.

## The question

Issue [#6](https://github.com/vatsaldave-simform/interview-question-bank/issues/6) requires a
Viewer to filter the bank by any combination of Categories: **Tags within a Category combine with
OR, distinct Categories combine with AND**, evaluated as one database query on top of the scoped
query builder (ADR-0003), paginated and stably ordered.

Two SQL shapes express that. Which one should the repository emit at ten thousand Questions?

**Shape A — one `EXISTS` per Category**

```sql
SELECT q.id, q.created_at
FROM questions q
WHERE <visibility predicate>
  AND EXISTS (SELECT 1 FROM question_tags qt
              WHERE qt.question_id = q.id AND qt.tag_id = ANY (ARRAY[<tags in category 1>]))
  AND EXISTS (SELECT 1 FROM question_tags qt
              WHERE qt.question_id = q.id AND qt.tag_id = ANY (ARRAY[<tags in category 2>]))
ORDER BY q.created_at DESC, q.id DESC
LIMIT 50 OFFSET 0
```

**Shape B — grouped aggregate with a distinct-Category count**

```sql
SELECT q.id, q.created_at
FROM questions q
JOIN question_tags qt ON qt.question_id = q.id
JOIN tags t ON t.id = qt.tag_id
WHERE <visibility predicate>
  AND qt.tag_id = ANY (ARRAY[<every selected tag>])
GROUP BY q.id
HAVING count(DISTINCT t.category_id) = <number of categories filtered on>
ORDER BY q.created_at DESC, q.id DESC
LIMIT 50 OFFSET 0
```

Both are correct — the harness proves that per scenario before it times anything, by taking the
symmetric difference of the two unpaginated result sets. The question is purely which one the
planner can execute well.

## Running it

```sh
./run.sh
```

That is the whole setup. The script builds its own throwaway Postgres cluster under
`$TMPDIR/PROTOTYPE-combined-filter-pgdata-wipe-me`, seeds it, measures, prints a comparison, then
stops and deletes the cluster. It never touches a system Postgres and needs no server, no Docker
and no credentials — only `initdb` on the `PATH` or under `/usr/lib/postgresql/*/bin`.

| Knob | Default | Meaning |
|---|---|---|
| `ROWS` | `10000` | Bank size. `ROWS=50000 ./run.sh` re-runs the whole comparison at 50k. |
| `RUNS` | `5` | Repeats per measurement; the **median** execution time is reported. |
| `KEEP` | unset | `KEEP=1 ./run.sh` leaves the cluster up and prints the `psql` line to connect. |
| `PORT` | `55432` | Port for the scratch cluster. |
| `SCRATCH` | `$TMPDIR` | Where the scratch cluster lives. |

Full `EXPLAIN (ANALYZE, BUFFERS)` plans land in `results/<ROWS>/`, one file per scenario.

## The bank it measures against

Ten thousand Questions, twelve Categories, 170 Tags, ~116k Question–Tag rows, ~20% of Questions
restricted to one of five Clients, measured as a Viewer holding Permission Grants for two of them
(so ~8.8k of the 10k are Visible). Tag popularity is deliberately skewed, so "broad tag" (40–66%
of the bank) and "narrow tag" (2–7%) are genuinely different selectivities.

`created_at` is uncorrelated with `id`, so the ordering index is not accidentally aligned with
heap order — otherwise Shape A would look better than it is.

The generator derives every random choice from an md5 of the row key rather than calling
`random()`. This is not fussiness: a volatile `random()` in a join qualifier or a
`generate_series` bound is evaluated **once**, not per row, and the first version of this seed
silently gave every Category a single coin flip — one Category ended up on zero Tags and every
Question got exactly one Tag per Category. Hashing the row key cannot be hoisted, and makes the
bank byte-identical on every run.

## Result at ten thousand Questions

Median of 5 runs, page size 50, parallel query disabled, warm cache.

| Scenario | A (ms) | B (ms) | Faster | Rows matched |
|---|---:|---:|:--|---:|
| 1 category, broad | **1.7** | 23.7 | A, 14x | 3560 |
| 2 categories, broad | **1.7** | 34.7 | A, 20x | 2333 |
| 3 categories, broad | **3.8** | 39.0 | A, 10x | 1533 |
| 1 category, narrow | **1.7** | 2.1 | A, 1.3x | 186 |
| 3 categories, narrow | **2.5** | 7.6 | A, 3x | 0 |
| 3 categories, mixed broad + narrow | **3.1** | 46.3 | A, 15x | 78 |
| 2 categories, broad, last page (offset 2283) | **20.3** | 43.3 | A, 2x | 2333 |

**Shape A wins every scenario at 10k, by 1.3x to 20x.**

### Why

The plans say it plainly. For *2 categories, broad*:

- **Shape A** walks `questions_created_at_id_idx` **in the requested order** and probes
  `question_tags_pkey` per candidate, so `LIMIT 50` pushes into the nested-loop semi-joins and it
  stops early: 211 Questions examined, **826 buffers**.
- **Shape B** cannot stop early. `GROUP BY` with a `HAVING` over an aggregate is a blocking
  operation: all 6,949 groups must be built and filtered before `ORDER BY … LIMIT` sees a single
  row. It sorts 9,536 rows to produce 50: **23,808 buffers**, 29x Shape A's.

Shape B's handicap is *not* the extra join to `tags`. That join is a hash over 170 rows and costs
2 buffers — denormalising `category_id` onto `question_tags` would not rescue it. The cost is
structural: the aggregate has to finish before the ordering can be applied.

The second, less obvious finding is that **Shape A is not one plan**. When the filter is selective
or the page is deep, the planner abandons the ordering-index walk and drives from
`question_tags_tag_id_question_id_idx` instead, hash-aggregating candidates and sorting them. It
picks whichever strategy fits the selectivity. Shape B has no such choice — its plan is the same
blocking aggregate every time.

## Does the verdict hold at 50k?

`ROWS=50000 ./run.sh`. Yes, with one crack worth recording:

| Scenario | A (ms) | B (ms) | Faster |
|---|---:|---:|:--|
| 1 category, broad | **1.7** | 74.0 | A, 44x |
| 2 categories, broad | **2.5** | 121.7 | A, 49x |
| 3 categories, broad | **4.6** | 89.7 | A, 20x |
| 1 category, narrow | 13.3 | **9.6** | **B, 1.4x** |
| 3 categories, narrow | **11.8** | 23.6 | A, 2x |
| 3 categories, mixed broad + narrow | **35.0** | 130.0 | A, 3.7x |
| 2 categories, broad, last page (offset 11759) | **73.9** | 142.8 | A, 1.9x |

Shape A's advantage *widens* on broad filters as the bank grows, because its work is bounded by
the page, not the bank. The one place it loses is a **highly selective single-Category filter**,
where the ordering-index walk has to travel a long way to find 50 matches while Shape B's
tag-driven set stays small. That is the shape of the crossover: Shape A's cost scales with
bank size ÷ selectivity, Shape B's with the size of the tag-matching set. Nothing here crosses
150ms at 50k, so it does not change the decision — it names the condition under which it would be
worth revisiting.

## Where the limit-and-offset ceiling sits

`OFFSET` is not free for either shape, because both must produce and discard the skipped rows.
Walking to the last page of a 2,333-row result at 10k costs Shape A 20.3ms against 1.7ms for the
first page — a 12x penalty, and the point at which its early-stop advantage is gone. The ceiling
is not reached at this size: the deepest page of the broadest filter still returns in well under
100ms at 50k. Keyset pagination would remove the penalty but changes the API shape, and at a bank
this size it is not yet worth paying for.

## Caveats

- `EXPLAIN ANALYZE` adds per-node instrumentation overhead. It inflates both shapes and both are
  measured the same way, so the comparison holds even though the absolute numbers are pessimistic.
- Parallel query is disabled (`max_parallel_workers_per_gather=0`) so the two shapes are compared
  on single-worker cost rather than on how many workers the planner happened to grant.
- Warm cache: every plan reports `shared hit`, no reads. This is the steady state, not a cold start.
- Single machine, one Postgres 16 cluster, default cost settings.
- The keyword search (ADR-0004) is **not** part of this measurement. Composing `tsvector @@
  websearch_to_tsquery` on top of the winning shape is issue #12's job.

## Verdict

**Shape A — one `EXISTS` per Category.** Faster in every scenario at ten thousand Questions,
by a margin that widens with the bank on the common broad-filter case; it lets `LIMIT` push down
into the plan, and it leaves the planner free to switch strategies when the filter is selective.
It is also the shape that composes most cleanly with the scoped query builder, since each Category
adds one independent predicate rather than restructuring the whole statement.

Recorded as ADR-0011.
