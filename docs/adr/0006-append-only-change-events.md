# Change history is an append-only event log, not row versions

A rejected duplicate submission has to leave a trace of who and when — but nothing was stored,
so there is no Question row to hang a version or a snapshot off. A shadow table of row versions
cannot represent an event about a Question that does not exist.

We record an append-only Change Event carrying a **nullable** Question reference, the acting
Viewer, the time, the event type, and a payload. Rejected submissions get a row with a null
Question reference and the attempted content in the payload.

## Consequences

The optional "suggested edit" flow reuses this table rather than a parallel mechanism, which is
what that stretch goal explicitly asks for.
