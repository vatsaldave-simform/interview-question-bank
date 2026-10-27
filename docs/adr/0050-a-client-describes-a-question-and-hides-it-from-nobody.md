# A Client describes a Question and hides it from nobody

Until now a Question could be restricted to one Client. Only Viewers holding a Permission Grant
for that Client could see it. Phase 2 drops that. **A Client is now a fact about a Question: an
organisation that asked it in its interviews.** It hides the Question from nobody. A Question may
name several Clients, or none, and every Viewer may filter the bank by them.

This replaces ADR-0018 and ADR-0042, and the response shape in ADR-0044.

## What stays

Visibility stays, but only for publication. A Question is Visible when it is Published, when the
Viewer is its Author, or when the Viewer is a Reviewer. So the one query function (ADR-0003), the
check-first rule (ADR-0002) and the Near-Duplicate rule (ADR-0007) all still hold. They just lose
the Client condition.

## A join table, not a Column and not Tags

A Question can be asked by several Clients, so one `clientId` column is not enough. The link is a
`question_clients` table, one row per Question and Client.

We did not turn Clients into a Category of Tags, though a Client now acts much like a Tag. Clients
are created by an Administrator, while Categories are fixed in code (ADR-0024). A Client may also
gain its own fields later. The Client filter is written in the same shape as the Tag filter, one
`EXISTS` beside the others (ADR-0011), so it costs nothing in query style to keep them apart.

## Who changes a Question's Clients

The old rules were uneven: Authors narrow, Reviewers widen, nobody moves a Question (ADR-0018).
That was only because a Client hid things, and a wrong change could hide a Question from its own
Author. That risk is gone. Adding a Client to a Question or removing one is now an edit like any
other, by whoever may edit the Question. An edit sends the full list of Clients, and the server
works out what was added and removed.

## Each change is its own event

Every Client added is a `question_client_added` event, and every Client removed is a
`question_client_removed` event, one per Client.

We did not fold them into the `question_edited` payload as a before and after list. A history
reads more plainly as "Client X added" than as two lists to compare by eye. And a separate type
can be found in the log without opening every edit's payload.

The old `question_classified` and `question_declassified` events stay in the log, and their
values stay in the enum, because the log is append-only (ADR-0027). The history shows them with
the new wording, as a Client added and a Client removed.

## Consequences

- Every Question that was restricted becomes visible to every Viewer the moment this ships. Every
  current restriction is copied in as one of the Question's Clients. This is safe because the
  bank holds only made-up data.
- Permission Grants authorise nothing, so they are removed (ADR-0051).
- `GET /api/clients` lists every Client for every Viewer. `GET /api/clients/all` goes.
- A Question returns `clients: { id, name }[]` in place of `client: { id, name } | null`.
- The change ships in expand and contract steps. Each migration must work with the code before it
  and the code after it, because Render does not swap the code and the schema in the same instant.
