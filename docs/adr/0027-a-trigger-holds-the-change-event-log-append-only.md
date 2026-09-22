# A trigger holds the Change Event log append-only

ADR-0006 says the history is an append-only log. Nothing so far made that true. Prisma generates
`update` and `delete` for every model, so "never rewritten" was a promise about how people would
use the client rather than something the data could rely on. A history that can be quietly
corrected is not a history.

The migration adds a trigger that raises on `UPDATE` and on `DELETE` of `change_events`. The rule
now belongs to the table. A future caller, a hand-written statement and a console session are all
refused alike, and none of them has to know the rule exists.

## Consequences

`TRUNCATE` is not covered. Row triggers do not fire on it, and the suite empties the database that
way between tests. Leaving it uncovered is deliberate. Covering it would leave the test database
with no way to be emptied, and truncating a table is an act on the whole database rather than an
edit to one Change Event.

The test helper that puts the seeded Questions back can no longer delete them, because a Question
with events cannot be deleted either. It truncates instead.
