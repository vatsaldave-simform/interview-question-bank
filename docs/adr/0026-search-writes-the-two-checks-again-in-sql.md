# Keyword search writes the two checks again, in SQL

**Replaced under issue #59.** Every read now uses the SQL checks, and the Prisma spelling is
gone, so each check is written once. What follows is the decision as it was made, then what
changed and why, at the end.

ADR-0003 turned down Row-Level Security and put the guarantee in the code instead: every
Question read goes through one function that always adds the visibility check, and
filtering and search build on top of it. Keyword search is the first read that cannot.

Prisma's `where` builder has no way to say `tsvector @@ websearch_to_tsquery(...)`. Its own
`search` filter is not that thing — ADR-0004 records why it cannot use the index. So the
search is hand-written SQL, and hand-written SQL cannot take a `Prisma.QuestionWhereInput`.
The visibility check and the Publication State check are therefore written twice: once as
Prisma conditions for the list and the single fetch, and once as SQL for the search.

That is the cost. Two spellings of one rule can get out of sync, and the failure is silent
and is the exact failure this project cares most about: a Question reaching a Viewer who
may not see it.

## What was rejected

**Rewriting the list in SQL too**, so the rule is written once. It is the tidier end state
and we may still get there. It is not this ticket: ADR-0011 measured the list's shape
through Prisma a week ago, and rewriting the measured query to tidy up a rule that a test
already holds would spend that measurement to buy nothing a reader can see.

**Fetching the ids in SQL and the rows through Prisma**, so the Prisma condition still
runs on the way out. The rule would still be written twice — the SQL has to check
visibility too, or it ranks and pages over Questions the Viewer may not have — and it
costs a second trip to say it.

**A database view or a `SECURITY DEFINER` function** holding the condition. That moves the
rule into migrations, where the checks are furthest from the code that has to agree with
them, and it is most of the way to the RLS that ADR-0003 turned down.

## Consequences

- Both functions stay in `questions.repository.ts` and neither takes a `where` from its
  caller. The way in is still one module; it is now two functions inside it.
- The search is held to the same visibility answers as the list by its own tests: a
  Client-restricted Question stays out for a Viewer holding no Grant, and a Pending
  Question stays out for a Reader. Those tests are what replaces the shared condition, so
  a change to either check has to change both spellings or the suite goes red.
- A Reviewer gets no Publication State condition, exactly as in the Prisma version, and
  for the same reason: it is AND-ed with the visibility check and cannot widen it
  (ADR-0013).
- Searching and not searching order differently. With keywords the order is `ts_rank` then
  the Question id; without them it stays `createdAt DESC, id DESC` (ADR-0011). One endpoint
  answers in two orders, and the caller can tell which by whether it searched.
- The next read that needs SQL — near-duplicate detection, which is #36 — makes this three
  spellings. That is the point to stop and rewrite the list, not now.

## The rule written once (issue #59)

The last consequence above guessed the moment would come with near-duplicate detection, #36.
It came one ticket earlier, in #11, which built detection, and in a milder form than guessed.
Detection reused the SQL visibility check instead of copying it, and its Publication State
condition is its own narrower rule (ADR-0014), not a third spelling of the list's. So the rule
stayed at two spellings rather than three. The trigger still fired. The rewrite was put off to
keep #11 to one concern, and done under #59.

**What was done.** The option this ADR first turned down, rewriting the list in SQL too.

- The SQL spelling is the only one. `visibleTo` holds the first check and `visibleQuestions`
  holds both. They are still not exported, and no caller can remove a check or add a
  condition of its own (ADR-0003).
- Every read builds on `visibleQuestions`: the list, the fetch, the Reviewer's queue, an
  Author's own unpublished Questions and the search. They share one function that reads the
  rows the page picked, with their Client and Tags built by the database. The history
  checks with the same condition, then reads its events by id.
- The writes stay in Prisma, so Prisma still sets `updatedAt`. Each first locks the row with
  `SELECT … FOR UPDATE` under the same checks, then writes by id. Each keeps its own
  condition on the state it starts from, so of two writes at once, the second waits on the
  lock and then finds nothing to move.

**What the measurement showed.** This ADR turned the rewrite down because it would spend
ADR-0011's measurement. So the list was measured again, before and after, against the same
bank of 10,009 Questions:
[`the-list-before-it-moved-to-sql.md`](../evidence/query-plans/the-list-before-it-moved-to-sql.md)
and [`the-list-at-ten-thousand-questions.md`](../evidence/query-plans/the-list-at-ten-thousand-questions.md).

- The page is chosen the same way. The plan walks the ordering index and stops once the page
  is full, or drives from `question_tags` when the Tag is rare, as ADR-0011 found.
- On a deep page, both versions drive from `question_tags`. The new one does it the way
  ADR-0011 describes. It takes less time, 9.3ms against 14.4ms, but touches about ten
  times the pages, 9,288 against 876, because it looks each matching Question up by id
  where Prisma's read the whole table once.
- The new statement does between 1.3 and 2.3 milliseconds more work in the database,
  because it builds the page's Tags there. It saves the four round trips Prisma needed to
  load them. Timed end to end, on the same machine, it was about as fast or faster. That
  timing came from a script that was not kept, and the Prisma version was timed once, so
  treat it as a sign rather than a measurement anyone can repeat.

`pnpm db:measure:plans <label> list` captures the list's plans again. The Prisma version
cannot be captured again, because it is gone.

## Consequences of #59

- A change to either check is a change to one function. The search's own visibility tests,
  which this ADR said stood in for a shared condition, now hold the same condition as every
  other read.
- The consequences above about order still hold. The search orders by `ts_rank` then id, and
  every other list orders by `createdAt` then id.
- ADR-0043 and ADR-0044 each note that only the search was hand-written SQL. That is no longer
  true, and neither decision rests on it. ADR-0043 also keeps Ratings out of the query that
  picks the page so the order cannot depend on them. ADR-0044 reads the Client after the page
  is cut, which every read still does.
