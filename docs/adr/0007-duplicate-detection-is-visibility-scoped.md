# Near-duplicate detection runs inside the visibility seam

Duplicate detection reads Questions, so it leaks like any other read. A check run across the
whole bank would answer a submission with "this closely duplicates an existing Question" even
when the match is restricted to a Client the submitting Viewer holds no Permission Grant for —
revealing that a restricted Question exists, through a feature that looks nothing like search.

The check therefore runs through the same scoped query builder as everything else, over
Visible Questions only.

## Consequences

The bank can hold genuine duplicates that straddle a visibility boundary, and no one who can
see both will be told. That is the correct trade: the brief is unambiguous that a visibility
leak is fatal and a missed duplicate is not.

The general rule, of which this is one instance: the client-visibility guarantee has to hold in
*every* feature that reads Questions, not only in search and filtering.
