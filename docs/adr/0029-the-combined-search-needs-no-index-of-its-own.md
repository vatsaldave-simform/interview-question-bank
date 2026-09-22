# The combined search needs no index of its own

ADR-0011 chose the combined Category filter's SQL shape by measuring it, and left one
thing open: composing keyword search (ADR-0004) on top of that shape adds a second index
the planner must choose between, and nobody had measured the result. Issue #12 measured
it, at ten thousand Questions, against the compose PostgreSQL.

**No index was added.** The two the query relies on already exist, and both were put there
by earlier decisions: `questions (searchVector)` as a GIN index (ADR-0004), and
`question_tags (tagId, questionId)` (ADR-0011).

Every plan uses an index, none reads the whole table, and nothing takes longer than 7.3ms.
The full output is in
[`ten-thousand-questions.md`](../evidence/query-plans/ten-thousand-questions.md), under
`docs/evidence/query-plans/`, and `pnpm db:measure:plans` captures it again.

**The planner chooses which index drives the query, per query.** When the keyword is the
selective half it drives from the search vector index and probes `question_tags` per
candidate. When the Tag is the selective half it drives from `question_tags` and checks
the search vector as a filter. This is the same property ADR-0011 found for the filter on
its own: not one plan, but a strategy picked from how much of the bank each half matches.
Dropping either index removes a strategy.

## What was rejected

**A partial GIN index on the Questions that are Published**, which is the obvious candidate:
the filter throws away about a fifth of what the search vector index returns, because a
Reader may not see a Pending or Rejected Question (ADR-0013).

It works, and better than expected. PostgreSQL rewrites
`(publicationState = 'published' OR authorId = $1)` into a `BitmapOr` of the partial index
and `questions (authorId)`, so it is used even though the query never asks for Published
alone.

It is still not worth having. Measured against the same bank, pages touched:

| scenario | without it | with it |
| --- | ---: | ---: |
| a narrow keyword, no Category | 556 | 520 |
| two keywords, no Category | 264 | 257 |
| a narrow keyword and a common Tag | 1,108 | 1,072 |
| a broad keyword, no Category | 1,052 | 1,053 |
| a broad keyword and a common Tag | 1,076 | 1,077 |
| a broad keyword and two Categories | 1,117 | 1,118 |

Between three and six per cent off a selective keyword, nothing off a broad one, and a
page more on three of them. That buys a second GIN index to maintain on every write to a
Question, against totals of five to seven milliseconds. The plans are beside the others,
in [`with-a-partial-search-index.md`](../evidence/query-plans/with-a-partial-search-index.md).

**An index to make a deep page cheaper.** There is nothing to index: the order is
`ts_rank`, which is computed per row, so no index can supply it. See the consequence below.

## Consequences

- The limit-and-offset ceiling sits somewhere different for the search than for the list.
  ADR-0011 measured a 12x penalty on the last page of a filtered list, because that query
  can stop early and `OFFSET` takes the early stop away. The search cannot stop early at
  all: every matching Question has to be produced and ranked before the first row of any
  page is known. The first page and a page two thousand rows in run the same scan of 3,884
  rows and differ only in the sort — 31kB of top-N heapsort against 370kB of quicksort,
  5.5ms against 7.3ms. Keyset pagination would not remove that, because the thing being
  paged is a ranking. It is not worth paying for and there is nothing here to buy.
- A broad keyword reads every page of the questions table, through a bitmap heap scan
  rather than a sequential scan. That is not a missing index. A keyword carried by two
  Questions in five has to read two Questions in five.
- The bulk seed leaves the search vector index about nine times larger than a freshly
  built one — 4,224kB against 488kB after a `REINDEX` — because it is updated a row at a
  time as ten thousand Questions go in. It makes no measurable difference: every page
  count above is identical either way, because the bitmap index scan reads four pages of
  it whatever size it is. Do not reindex to make the numbers look better; they do not
  change.
- The measurement is local by ADR-0012, and so is `pg_stat_statements` by ADR-0009's
  amendment. Neither is an observability story for the deployment, and this ADR is not a
  claim about how the deployed bank performs.
- This is measured at ten thousand Questions. The crossover ADR-0011 flagged at fifty
  thousand — a selective single-Category filter — was not re-examined with a keyword on
  top, and is still the thing to watch.
