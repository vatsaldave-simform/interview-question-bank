# The Category vocabulary is closed in code; Tag values are rows

Categories and Tags look like the same kind of thing — names a Question is classified by — and the
obvious model makes them one: two tables, both open, both edited by whoever administers the bank.
That model cannot satisfy the requirement that a Tag naming a Category that does not exist is
refused **at the edge, before business logic runs**. A schema at the edge checks the request against
what the process already knows; a Category list living only in `categories` is not known there, so
the refusal becomes a database lookup inside the handler, which is business logic by any reading.

So the two are modelled asymmetrically. The Category **names** are a closed Zod enum in
`@iqb/shared` (`categoryNames`), which is what the add-Question schema validates against and what a
client renders its pickers from. Tag **values** stay rows in `tags`, each belonging to exactly one
Category, and an unknown Tag value is refused inside the handler as an ordinary invalid request.

The asymmetry follows the rate of change rather than aesthetics. A new Category is a change to what
the bank classifies along — every filter, every picker and every stored Question's shape are
affected, and it is a release. A new Tag is content: `senior` joins `junior` and `mid` without a
line of code moving. Freezing the first in code and leaving the second in data puts the release
boundary where the real one already is.

`categories` still exists as a table, because Tags need something to hang from and a Category
carries a display name that the spelling used in the API should not have to serve as. It is seeded
from the same closed list, so the enum and the rows cannot get out of sync without the seed saying
so. `CONTEXT.md`
has no glossary term for that display name — a gap worth closing when the vocabulary is next
revisited, and not a reason to reach for *label*, which the glossary avoids for Tag.

## Consequences

- Adding a Category means editing `categoryNames`, seeding the row and shipping both together. A
  Category seeded but absent from the enum is unreachable; one in the enum but not seeded fails
  when a Question names it. The seed is the only place that has to keep them in step.
- Nothing may offer "create a Category" to an Administrator. Administration (#20) creates Clients
  and Viewers, not Categories, and that is now a structural fact rather than an omission.
- The closed list is safe to send to a client and safe to compile into one, which is what lets the
  browser refuse an unknown Category without asking the API first.
