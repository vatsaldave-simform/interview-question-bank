# Keyword search writes the two checks again, in SQL

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
