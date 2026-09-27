# A Question names its Client, not just its id

#98 shows a Viewer when a Question is restricted to a Client, and which one. Until now, every
Question the API returned named its Client only by `clientId`. A person cannot read an id. This
is the same problem ADR-0035 solved for the Viewers in a Question's history.

**Every Question the API returns carries `client: { id, name } | null` in place of `clientId`.**
It is `null` when the Question is not restricted. It is read in the same query as the Question,
from the Client the row already points at. The keyword search is hand-written SQL (ADR-0026), so
it builds the same shape itself, after the page has been cut.

## Why this shows nothing it should not

**It only goes to someone who can see the Question.** Every Question read goes through the same
visibility check (ADR-0003). A restricted Question reaches only a Viewer who holds the Grant for
its Client. So the only Client name a Viewer is ever sent is one they already hold a Grant for,
and their own Client list already shows them that name.

**It is the Client's shape the API already sends.** `{ id, name }` is what `GET /api/clients`
answers with, so the frontend reads one shape for a Client wherever it meets one.

## What we did not do

**Keep `clientId` and have the frontend look the name up in the Viewer's Client list.** That
needs no change to the Question. But it is a second request on every screen that shows a
Question, and a Question the list does not explain would have to show the id after all.

**Send both `clientId` and `client`.** Two fields that say the same thing can disagree, and a
reader has to learn which one wins.

## Consequences

- A request body still names a Client by `clientId`, when adding a Question or restricting one.
  Only the responses change.
- A Change Event still names a Client by id. The history does not show Client names yet.
- A Client is never renamed today. If one ever is, every Question shows the new name, as a
  Viewer's history shows their new email (ADR-0035).
