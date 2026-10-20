# A Reviewer sees who wrote a Pending Question

#143 puts the Questions waiting for review on Home, and its design has each row say who wrote it.
Until now, a Question in the API named its Author only by `authorId`. A person cannot read an id.
This is the same problem ADR-0035 solved for a Question's history, and ADR-0044 solved for its
Client.

**Each Question in `GET /api/questions/pending` also carries `author: { id, email }`.** No other
response does. Browse, the fetch of one Question, and an Author's own list send the Question as
before. The authors are looked up by id once the page has been picked, as Ratings are (ADR-0043),
so they cannot change which Questions the queue finds.

## Why a Reviewer may see it

**A Reviewer works through the queue by who sent what.** A Rejected Question goes back to its
Author with a reason, so the Reviewer is writing to a person, and it helps to know who. A
Reviewer should also notice when one Author sends the same kind of Question again and again, and
only the author's name shows that. A queue that hides the author leaves the Reviewer to open each
Question's history to find out.

**It shows nothing the Reviewer could not already find.** The queue goes through the same
visibility check as every other Question read (ADR-0003, ADR-0013). So it only holds Questions
the Reviewer may already open, and each one's history already names its Author by email
(ADR-0035). An email is not a secret here, for the reasons ADR-0035 gives.

## Why only the queue

**Anywhere else, the author is not needed, and showing it would change the bank.** A Reader
reading a Published Question needs what it asks and how to judge the answer, not who wrote it. If
every Question carried its author, the bank would start to read as a list of people's work. The
Question's history still says who wrote it, for anyone who wants to know.

**The queue only goes to a Reviewer.** `requireRole("reviewer")` sits on the route. A Reader or an
Author asking for it is refused before anything is read, so the author never reaches them by this
path.

## What we did not do

**Put `author` on every Question.** It is one shape everywhere and one change. But it sends the
author to every Reader on every page, which is the change this decision keeps out.

**Replace `authorId` with `author` in the queue.** ADR-0044 replaced `clientId` that way. Here the
queue's Question would then not be a Question the rest of the client can read. The Question page
uses `authorId` to decide which acts to offer (ADR-0045). Keeping it means one shape of Question,
with the queue adding one field.

## Consequences

- The queue costs one more query per page, whatever its size.
- A Deactivated Author is still named, because no Viewer is ever deleted (ADR-0017).
- If an Author's email ever changes, the queue shows the new one, as the history does (ADR-0035).
