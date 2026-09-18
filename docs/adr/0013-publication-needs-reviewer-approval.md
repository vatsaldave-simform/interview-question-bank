# A Question is published only after a Reviewer approves it

Near-duplicate detection catches similarity, not worth. A Question nobody has asked before and
nobody should ask — "what is 2 + 2?" — passes every check the bank has and lands in it. The
problem statement is that people cannot trust what they find in scattered personal documents, and
a bank they cannot trust either has solved nothing.

A Question therefore enters as Pending and only a Reviewer moves it to Published or Rejected. A
Reader cannot reach a Pending or Rejected Question; its Author and Reviewers can.

This gives a Question a second way of being out of reach, alongside not being Visible, and the two
are ordered. **Visibility is still checked first**, on every path, through the same query function
(ADR-0002, ADR-0003); publication state is a second check that runs after it. A
Pending Question restricted to a Client is invisible to a Reviewer holding no Permission Grant for
that Client — the review role does not become a visibility bypass. To a Reader, a Pending Question
answers identically to a Question that does not exist, exactly as a restricted one does.

The review check is on the way into the bank and nowhere else: edits to a Published Question go live. Sending
them back for review would either pull a Question out of the bank while a typo fix waits for a
Reviewer, or hold the edit beside the published row — row versions, which ADR-0006 considered and
rejected in favour of the event log. The backstop for a bad edit is that log, which names who
changed what, and the Reviewer's standing authority to edit any Visible Question back.

Publication is not terminal. A Reviewer may return a Published Question to Pending with a reason,
which is the only non-destructive way to correct one in a system that has neither delete nor
unpublish — most sharply a Question restricted to the wrong Client (ADR-0018), where returning it
stops the exposure at once. The Author corrects it and resubmits, and detection runs again at
republication (ADR-0014).

## Consequences

Every test that two answers look the same now has two things to hold across rather than one, and
they have to hold together: not Visible, not Published, and both at once.

A Reviewer may Publish a Question they submitted themselves, recorded as the same Viewer doing
both. Requiring a second Reviewer is theatre when a Reviewer may already edit any Visible Question
into anything they like, and it stalls the bank whenever one person is away.

Rejection carries a reason the Author can read; the Author edits and explicitly resubmits, so that
half-finished work does not reappear in the queue. Withdrawing a submission is rejecting your own.
