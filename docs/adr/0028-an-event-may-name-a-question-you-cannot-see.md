# A Change Event may name a Question its reader cannot see

Until near-duplicate detection, every Change Event was about the Question it hung off:
added, edited. Reading a Question's history told you nothing you could not already read.

Detection breaks that. A refused submission and an override both carry the Near-Duplicates
they were judged against — Questions of their own, with their own ids and their own text.
Detection picks them from what the *submitting* Viewer can reach (ADR-0007), and the
history is then read by somebody else.

The leak is real and was built before it was caught. An Author holding a Grant for one
Client submits a Question resembling that Client's, confirms it is genuinely different,
and the Question is stored unrestricted and Pending. Every Reviewer can read a Pending
Question with no Client (ADR-0013), so every Reviewer could read the override event, and
with it the restricted Question's id and full text.

**Only the Viewer a Change Event names may read one that names another Question.** For
everybody else the event is not in the history at all.

## What was rejected

**Storing less in the payload.** Dropping the text, or the ids, or both. It does not work:
an override event says on its own that something resembling this Question exists somewhere
the reader cannot look. The presence is the leak, so trimming the contents does not close
it.

**Checking each named Question on read** and dropping the ones the reader may not see,
dropping the event when none survive. This is strictly better — a Reviewer who *does* hold
the Grant would keep the override as review context — and it is what to build when the
review queue needs it. It costs a second scoped query on every history read and a rule
about when an event disappears, which is more than this ticket needs.

## Consequences

A Reviewer sees that a Question was added and not that its Author overrode a
Near-Duplicate to add it, even when the Near-Duplicate is one they could have read. That
is review context genuinely lost, and it is the reason the rejected alternative above is
worth returning to.

The Author keeps their own override in their own history, which is where the "recorded
against their name" in the ticket is answered from.

The rule is a property of the event kind, not of the payload, so a later kind that names
another Question — a suggested edit, say — joins the list rather than needing its own
thinking.

The refused-submission event is unreachable today: it names no Question, and the only
reader hangs off one. It carries the same content, so any later surface that reads the log
directly — an administration console — has to apply this rule rather than inherit it.
