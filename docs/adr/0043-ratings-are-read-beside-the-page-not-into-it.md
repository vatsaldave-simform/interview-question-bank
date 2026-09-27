# Ratings are read beside the page, not into it

A Viewer rates a Published Question from 1 to 5, and can change their Rating later. Every
Question in a response carries the average, the count, and the asking Viewer's own Rating. Nothing
says who gave any other Rating (CONTEXT.md).

**Ratings are their own table, `ratings`, unique on one Question and one Viewer.** Changing a
Rating replaces the row. It does not add a second one. A check in the migration holds the value
to 1–5, so no path can store a value outside the scale, whatever called it.

**The summary is read after the page of Questions has been picked and ordered.** Every read of
`questions` goes through the function in `questions.repository.ts` that applies both checks
(ADR-0003). That function picks the page and orders it. Only then does `withRatingSummaries` look
up the Ratings of the Questions on the page, by their ids, in one query for the whole page and one
for the Viewer's own. Nothing about a Rating can reach the query that picks the page, so a Rating
written between two page fetches cannot move a Question from one page to the other. The spec
rules out ordering by Rating for exactly this reason: an average that changes while someone pages
would drop some Questions and show others twice, which is the bug the id tiebreaker exists to stop.

**A Rating writes no Change Event.** The log records what happened to a Question: what it says,
who may see it, and where it is in review (ADR-0006). A Rating is an opinion about the Question,
not a change to it. A Rating in the log would also name who gave it, to anyone who can read the
history.

## What we did not do

**An average and a count stored on the Question row.** It would save the lookup. But every
Rating would then write the `questions` row, and so move `updatedAt` on a Question nobody changed.
Two Ratings at once would have to lock the row to keep the sum right. And a column on the row is
one an `orderBy` can reach, which is the thing this decision keeps out.

**The summary joined into the query that picks the page.** The same answer in one statement. But
the keyword search is hand-written SQL (ADR-0026), so the join would be written twice. And it puts
the Ratings inside the query whose order must not depend on them.

## Consequences

A response holding Questions costs two more queries, whatever the page size. The ratings table's
unique index starts with the Question, which is what those two queries look up by.
