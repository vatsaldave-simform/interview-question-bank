# The combined Category filter is one EXISTS per Category, not a grouped aggregate

Filtering the bank by several Categories at once — Tags OR'd within a Category, Categories AND'd
together — has two natural SQL shapes, and issue #6 requires the choice be made by measurement
rather than taste.

**Shape A** adds one `EXISTS (SELECT 1 FROM question_tags WHERE question_id = q.id AND tag_id =
ANY (...))` per Category. **Shape B** joins `question_tags` once, filters on every selected Tag,
groups by Question and keeps the groups whose `count(DISTINCT t.category_id)` equals the number of
Categories filtered on.

Both are correct. **Shape A is chosen**: it was faster in every measured scenario at ten thousand
Questions, by between 1.3x and 20x.

The reason is structural, not incidental. `GROUP BY` with a `HAVING` over an aggregate is a
blocking operation: Shape B must build and filter every group before `ORDER BY … LIMIT` sees a
single row. On a two-Category broad filter it sorts 9,536 rows through 23,808 buffers to return a
page of 50. Shape A walks `questions (created_at DESC, id DESC)` in the requested order, probes
`question_tags` per candidate and stops early — 211 Questions examined, 826 buffers, 29x fewer.

Shape B's handicap is not the extra join to `tags`. That join is a hash over 170 rows costing two
buffers; denormalising `category_id` onto `question_tags` would not rescue it.

A second property decided it as much as the timings: **Shape A is not a single plan.** When the
filter is selective or the page is deep, the planner abandons the ordering-index walk and drives
from `question_tags (tag_id, question_id)` instead, hash-aggregating candidates and sorting them.
It picks a strategy per selectivity. Shape B's plan is the same blocking aggregate every time.

Shape A also fits better with the shared query function (ADR-0003): each Category adds one more
condition on top of the visibility condition, rather than reshaping the statement into a grouped
query whose `HAVING` has to be worked out again every time the filters change.

## Consequences

- Shape A's cost scales with **bank size ÷ selectivity** — it pays to walk the ordering index
  until it has filled a page. Shape B's scales with the size of the tag-matching set. At 50k
  Questions the one scenario Shape B wins is a highly selective **single**-Category filter (9.6ms
  against 13.3ms). That is the crossover to watch; nothing at 50k exceeds 150ms, so it does not
  change the decision now.
- The two indexes the shape depends on are load-bearing: `question_tags (tag_id, question_id)` for
  the planner's selective strategy, and `questions (created_at DESC, id DESC)` for the early-stop
  strategy and for stable pagination. Dropping either one removes a plan Shape A relies on.
- `OFFSET` is paid by both shapes, since both must produce and discard skipped rows. At 10k, the
  last page of a 2,333-row result costs Shape A 20.3ms against 1.7ms for the first — a 12x penalty
  that erases the early-stop advantage. Keyset pagination would remove it but changes the API
  shape; at this size it is not worth paying for. This is where the limit-and-offset ceiling sits.
- Composing keyword search (ADR-0004) on top of this shape was measured separately, under issue
  #12, and needed no index of its own: **ADR-0029**. The planner picks which of the two indexes
  drives the query from how selective each half is, which is this shape's per-selectivity
  behaviour again. The search's limit-and-offset ceiling is not the one above, though — it cannot
  stop early at all, so a deep page costs it 1.3x rather than 12x.

Evidence, harness and full `EXPLAIN (ANALYZE, BUFFERS)` plans:
`backend/prototypes/combined-filter-sql-shape/`, kept out of main on a throwaway branch.
Re-runnable with `./run.sh`, which builds its own scratch Postgres cluster.
