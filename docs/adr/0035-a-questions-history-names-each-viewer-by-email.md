# A Question's history names each Viewer by email

#15 shows a Question's history in the client: who changed what, and when. Until now, each event
in `GET /api/questions/:id/history` named its Viewer only by `viewerId`. A person cannot read an
id. No endpoint turns one into anything else, and the client should not guess.

**Each event in the history also carries `viewerEmail`, the email of the Viewer the event names.**
It is read with the event, in the same query, from the Viewer the event row already points at.

## Why the email

CONTEXT.md says a Viewer "keeps their name on every Change Event", Deactivated or not. A Viewer
has no name today. The email is the only thing that says who they are. If a display name is
added later, it can sit beside the email.

## Why this shows nothing it should not

**It only goes to someone who can see the Question.** The history is read through the same
visibility check as every other Question read (ADR-0003). A Question the reader cannot see
answers `not_found`, events and all.

**The events that name another Question are still hidden.** An event that names a Near-Duplicate
reaches only the Viewer it names (ADR-0028). So the only email on it is the reader's own.

**An email is not a secret here.** It is what a colleague signs in with. Knowing one does not
help anyone sign in as them: that still needs the password, and failed logins are limited
(ADR-0021).

## What we did not do

**Show "You" for your own changes and a short id for everyone else's.** That needs no API
change, but it does not say who made a change, which is what the history is for.

**A separate endpoint to look up a Viewer by id.** That is a second request per history and a
new way to ask about any Viewer, not only the ones on a Question you can see. Administration
(#20) may need a Viewer list, and that is where it belongs.

## Consequences

- A Deactivated Viewer's email stays on their events, because no Viewer is ever deleted
  (ADR-0017).
- If a Viewer's email ever changes, their old events show the new one. The history says who the
  person is, not what their address was at the time.
