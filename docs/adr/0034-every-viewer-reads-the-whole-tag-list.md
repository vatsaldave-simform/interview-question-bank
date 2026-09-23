# Every Viewer reads the whole Tag list

The browse screen from #14 filters by Tag, so it needs to know which Tags exist. Nothing told the
client that before. The Category names are a closed list in `@iqb/shared` (ADR-0024), but the Tag
values and the Category display names are rows in the database.

**`GET /api/categories` lists every Category with its display name and every Tag value it holds.**
It sits behind the sign-in check like every other `/api` route. It has no visibility check, and
every signed-in Viewer gets the same bytes.

## Why that shows nothing a Viewer could not already find out

Everywhere else, the rule is that a restricted Question looks the same as one that does not exist
(ADR-0002). So the question is whether a Tag list breaks that. It does not, for two reasons.

**No Question owns a Tag.** Tags are seeded content. Adding or editing a Question can only name a
Tag that is already there. The API refuses an unknown one (ADR-0024). So a Tag being in the list
says nothing about whether any Question carries it.

**The filter already answers this.** `?technology=python` answers 200 with an empty page for a
Viewer who can see no Question carrying `python`. `?technology=nope` answers 400. So which Tags
exist is already public to every signed-in Viewer. The list says the same thing in one request
instead of one request per guess. The seed keeps `python` on the second Client's Questions only,
and a test checks that a Viewer with no Grant for that Client still sees it listed.

## What we did not do

**Write the Tags into the client.** The Category names are compiled in, so the Tags could be too.
But the Category names are closed and change with a release. Tag values are content and change
with a seed. A copy in the client gets out of sync the first time someone seeds a new Tag, and the
filter would then offer a Tag the API refuses, or leave one out.

**List only the Tags on Questions the Viewer can see.** That would be a list that changes with the
Viewer's Grants. It would also have to match the filter, which accepts every Tag.

## Consequences

- If a later ticket lets a Question create a Tag as it is added, that ticket must revisit this
  decision. A Tag first written by a restricted Question would then say that the Question exists.
- The list comes in the closed list's order, and Tags come in alphabetical order. The list leaves
  out a Category row that the closed list does not name, because no request can filter by it.
