# An Administrator lists every Client, on a route of its own

`GET /api/clients` answers only with the Clients the caller holds a Permission Grant for. That is
story 28 of spec #20: the list a Viewer picks from when restricting a Question must not reveal that
a Client exists.

The administration console needs every Client. An Administrator who has just created one holds no
Grant for it (ADR-0015), so the Grant-scoped list leaves it out. They could never issue its first
Grant from a screen, because they could never pick it.

**`GET /api/clients/all` lists every Client, and only an Administrator may call it.** It answers in
the same shape as `GET /api/clients`, and `GET /api/clients` does not change.

This does not break story 28, for three reasons:

- An Administrator is the one who creates Clients, so they are not being told something hidden from
  the role.
- A Client's name gives no access to its Questions. Seeing the Questions still takes a Permission
  Grant, which an Administrator issues to themselves in the open (ADR-0015).
- Every Client created is already in the Change Event log, which names it.

## What we did not do

**Widen `GET /api/clients` for an Administrator.** One path would then give two different answers
depending on who asks, in a way story 28 does not describe. The dropdown for restricting a Question
will read that path too (#37). An Administrator would be offered Clients they hold no Grant for,
and a Question they restricted to one would vanish from their own view.

**Put the list under `/api/viewers`, or a new `/api/administration` path.** A Client list belongs
with Clients. The route carries its own Administrator check, as creating a Client already does.

## Consequences

`clients.repository.ts` now has two list reads. The Grant-scoped one is what every Viewer's own read
uses. The other is for an Administrator only, and its comment says so, the same way `findClientById`
already does.
