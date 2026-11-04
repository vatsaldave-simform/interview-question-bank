# Upvotes replace Ratings

Until now a Viewer rated a Published Question from 1 to 5, and a Question showed the average and
the count (ADR-0043). **Now a Viewer upvotes it instead: one mark that says it is a good one.** A
Question shows how many Upvotes it has. There is no scale, no average and no downvote. One mark
is quicker to give than a choice on a scale, and a count says more than an average of a few
Ratings.

## What an Upvote is

- A Viewer gives a Question at most one Upvote, and may take it back. Readers may upvote, and so
  may the Question's own Author.
- Only a Published Question gains Upvotes. Upvoting a Pending or Rejected one is refused with a
  409. A Question that is returned keeps the Upvotes it has.
- **Publishing a Question gives its Author's Upvote for them**, unless they hold one already. So
  a Question that is returned and Published again gives it back, even if the Author took it away.
  It is stored like any other Upvote, and the Author may take it back.
- An Upvote writes no Change Event and is never shown with who gave it, for the same reasons as a
  Rating (ADR-0043).

## How it is stored

**`upvotes` holds one row per Question and Viewer, and its primary key is that pair, Question
first.** The key does three jobs with one index. It stops a second Upvote from the same Viewer.
It finds a page's Upvotes by Question. And it answers whether the Viewer looking has given one.
There is no `id`, because nothing needs to point at an Upvote. There is no value and no
`updatedAt`, because an Upvote has nothing that can change: the row is there or it is not.

**Taking an Upvote back deletes its row.** That does not break ADR-0017. ADR-0017 is about Clients
and Viewers, which other rows point at. Nothing points at an Upvote, and an Upvote is not kept as
history, since it writes no Change Event. Deleting it loses nothing that was promised to be kept.
ADR-0051 makes the same argument for Grants.

**The foreign keys refuse a delete rather than cascade.** Questions and Viewers are never deleted,
so in normal use the rule never runs. If something does try, the database stops it with an error
instead of quietly removing the Upvotes with it.

**Upvotes are read beside the page, as Ratings were (ADR-0043).** The count and the Viewer's own
Upvote are looked up after the page of Questions has been picked and ordered. They never order
the bank, so there is no "most upvoted" sort.

**The migration that makes the table also gives every Question Published today its Author's
Upvote**, Inherited and seeded ones included. It is in the same migration so the table never
exists without them. The insert is safe to run twice.

## What we did not do

**Turn 4 and 5 Ratings into Upvotes.** A Rating answered a different question: how good, on a
scale. Reading a 4 as "this is a good one" would put a mark in a Viewer's name that they never
gave. Ratings are dropped, not converted.

**Give the Author's Upvote when the Question is submitted.** A Pending Question gains no Upvotes,
and one that is never Published shows none. Publishing is when a Question joins the bank, so that
is when its Author's Upvote is given.

**Allow downvotes.** A Question that should not be in the bank is returned by a Reviewer. A
downvote would be a second, weaker way to say that. A count that only goes up is also easier to
read than one that can go down.

## Consequences

- Migrations run before the new code is deployed (ADR-0012). A Question Published in the minutes
  between gets no Author's Upvote, because the code still running does not give one. This is
  accepted. The Author can give it themselves, and the backfill's insert can be run again safely.
- The `ratings` table is dropped last, once no running code reads it (ADR-0051).
- The glossary entry for Rating is now Upvote (CONTEXT.md).
