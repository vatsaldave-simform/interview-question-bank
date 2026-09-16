# Authors narrow, Reviewers widen, nobody moves sideways

Changing which Client a Question is restricted to is three operations wearing one name, and they
carry very different risk. **Classifying** attaches a restriction to an unrestricted Question and
only narrows who can see it, so any Author may do it to their own. **Declassifying** removes the
restriction and shows the Question to the whole bank; only a Reviewer may, and it is recorded as
its own event type rather than as a generic field change. **Reclassifying** — moving a Question
from one Client to another — nobody may do.

Reclassification is refused because of who loses by it. An Author holding no Permission Grant for
the new Client loses the Question entirely, and by the error contract it answers identically to one
that never existed: to its Author, reclassification and deletion are indistinguishable, in a system
that has no deletion. They cannot read its history either, since history is readable only for a
Question you can see.

Nothing needs it. A Question on the wrong Client is corrected by its Author, who chooses only among
Clients they hold a Grant for and therefore never loses sight of their own work. While the Question
is Pending the Author simply corrects it; once Published, a Reviewer returns it to Pending
(ADR-0013) and the Author corrects it there. Returning it also stops the exposure immediately,
which is a better first response to a misclassified Question than moving it and hoping.

## Consequences

An Author may narrow a Published Question's visibility but never widen it. Attaching a restriction
is theirs; removing one is not.

If the Author of a misclassified Question has been Deactivated, nobody can correct it and it stays
Pending indefinitely — out of the bank and not leaking, which is an acceptable place to be stuck.
