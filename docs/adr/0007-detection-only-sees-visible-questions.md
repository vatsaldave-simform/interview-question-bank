# Near-duplicate detection only looks at Questions you can see

Duplicate detection reads Questions, so it can leak like any other read. A check run across the
whole bank would answer a submission with "this closely duplicates an existing Question" even when
the match is restricted to a Client the submitting Viewer holds no Permission Grant for. That tells
them a restricted Question exists, through a feature that looks nothing like search.

The check therefore runs through the same query function as everything else, over Visible Questions
only.

## Consequences

The bank can hold genuine duplicates on opposite sides of a visibility boundary, and nobody who can
see both will be told. That is the right trade: the brief is clear that a visibility leak is fatal
and a missed duplicate is not.

The general rule, of which this is one case: the client-visibility guarantee has to hold in *every*
feature that reads Questions, not only in search and filtering.
