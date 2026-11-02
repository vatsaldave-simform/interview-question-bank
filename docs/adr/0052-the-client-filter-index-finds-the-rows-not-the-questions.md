# The Client filter's index finds the rows, not the Questions

Issue #195 added the Client filter and asked for its index to be chosen by measurement. The
filter is one `EXISTS` against `question_clients`, beside the one per Category (ADR-0011). The
table's primary key is `(questionId, clientId)`.

**We added `question_clients (clientId, questionId)`, and we keep it.** It is used wherever
the planner starts from a Client. But it did not do the thing we expected most: a rare Client
still reads the whole questions table. This ADR says why, so nobody adds a second index to fix
a plan that is already right.

The plans are in
[`client-filter-before.md`](../evidence/query-plans/client-filter-before.md) and
[`client-filter-after.md`](../evidence/query-plans/client-filter-after.md), under
`docs/evidence/query-plans/`. `pnpm db:measure:plans <label> client` captures them again.

## What we measured

A bank of 10,004 Published Questions from the bulk seed. Pages are pages touched, the number
ADR-0011 compared on. Timings here are a few milliseconds and move by tenths between runs, so
the pages are the number to trust.

| scenario | pages before | pages after |
| --- | ---: | ---: |
| a common Client (about 2,100 Questions) | 1,397 | 1,397 |
| a rare Client (206 Questions) | 1,407 | 1,332 |
| a Client on a handful of Questions (4) | 118 | 42 |
| two Clients | 986 | 986 |
| a common Client and a common Tag | 3,124 | 3,124 |
| a common Client and a broad keyword | 1,407 | 1,344 |
| a rare Client and a broad keyword | 1,409 | 1,334 |

## What the planner does

**A common Client walks the questions newest first, before and after.** It checks each one
against `question_clients` and stops when it has a page. That check asks "does this Question
name this Client?", and the primary key answers it, because `questionId` comes first in it.
This is ADR-0011's early-stop plan, and the new index plays no part in it.

**A rare Client starts from the Client instead.** Before the index, the planner had to read
all of `question_clients`, 79 pages, to find the rows for one Client. The primary key could
not help: it is sorted by Question, so the rows for one Client are spread across all of it.
After the index, the same rows take 4 pages, read from the index alone, never the table.

**That is all the index fixed.** With the 206 ids in hand, the planner still has to fetch the
206 Questions to sort them by date. Fetching them one at a time through `questions_pkey`
costs about three pages each, in scattered order: roughly 620 pages. Reading the whole
questions table in order costs 687. The planner picks the whole table, and it is right to.
Fetching rows one at a time only wins when the matches are a much smaller share of the table
than 2%.

So the rare Client went from 1,407 pages to 1,332, about 5%. The plan still reads the whole
questions table, and the evidence still marks it that way.

## Why we keep it

- It is the same index `question_tags` has, the other direction of the primary key. ADR-0011
  found the planner relies on that one when a Tag filter is selective. A Client filter is the
  same shape and gets the same plans.
- It removes a full read of `question_clients` from every plan that starts from a Client:
  the rare and the handful cases, and both searches. That read grows with the table. The
  questions table grows too, but the join table read is the part an index can remove.
- It costs little. Clients are added to a Question rarely, so the extra work on each write
  is small, and the index is small.

## What we did not do

**An index on `clientId` alone.** It would find the same rows. But the plan reads
`questionId` from each one, so it would have to open the table for every row, which the
two-column index avoids. Not measured, because the two-column index already read 4 pages.

**An index to stop the rare Client reading the whole questions table.** There is nothing on
the join table that can do it. The cost is fetching the Questions themselves, and at this
share of the bank, reading them all is the cheapest way.

## Consequences

- The rare Client's plan reads the whole questions table and is marked that way in the
  evidence. That is expected. It is not a missing index.
- This was measured at ten thousand Questions. At fifty thousand, a Client on 2% of the bank
  is a thousand Questions, and the trade between fetching them one at a time and reading the
  table may move. It sits beside ADR-0011's crossover as the thing to watch.
- Dropping this index puts the full read of `question_clients` back into every plan that
  starts from a Client.
