# Near-duplicate detection runs wherever Question text is written

ADR-0007 fixed *which Questions* detection looks at. This fixes when it runs, which is three
moments: submission, publication, and an edit to a Published Question's text.

Submission alone is not enough, for two reasons that both come with the review step. A Question
sits Pending for as long as review takes, and in that window another Question can be Published
which duplicates it — a check run at submission cannot catch a duplicate that did not exist yet.
A Reviewer may also rewrite a Question before Publishing it, and nothing has checked what they
wrote.

Publication alone is not enough either: the Author would write the Question, wait for review, and
only then learn it duplicated something, and the override for a wrong match is deliberately the
Author's to use rather than the Reviewer's.

Edits are the third, and without them the other two are a formality — an Author can Publish a
sound Question and then rewrite it into a duplicate with nothing watching. The alternative was to
bound what an edit may change and treat a large rewrite as a new Question, which needs a
"how different is too different" threshold that cannot be defended, and behaves bizarrely when it
fires.

Which Questions each check reads extends ADR-0007 without changing its rule: **each check runs over
the Questions the acting Viewer can reach**. The Author, at submission and on edit, is checked
against Visible and Published Questions — so a submitter is never told their Question resembles a
Pending one they cannot see, which would be the same way of finding out something exists, in a new
place. The Reviewer, at publication, is checked
against Visible Questions including Pending ones, because the queue is theirs to see.

Three details the implementation depends on. The edit-time check excludes the Question being
edited, or every edit matches itself. It fires on Question text alone, never on Answer Notes,
Tags, Client or Provenance — detection already reads only the text (ADR-0004). And a Pending
Question needs no edit-time check, because the publication check covers it.

## Consequences

Two Authors can hold near-identical Pending Questions at once, neither being told about the
other's. The Reviewer sees both in the queue, which is what the queue is for.

Changing a Question's Client restriction re-runs nothing, because the acting Viewer's reachable
set does not change when they move their own Question in or out of a restriction. A duplicate
straddling a visibility boundary therefore remains possible — the cost ADR-0007 already accepted.

The cost is at most three `pg_trgm` lookups against a GiST index across a Question's whole
lifetime, which is not a cost worth designing around.
