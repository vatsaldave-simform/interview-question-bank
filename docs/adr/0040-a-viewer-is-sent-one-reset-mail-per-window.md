# A Viewer is sent at most one reset mail per window

The reset request is limited per caller address (ADR-0021). Nothing limited how often one Viewer
was mailed. So a caller who knew a Viewer's address could have them mailed on every request that
limit allowed: about 1,900 mails a day from one caller address. That fills the Viewer's inbox.
It also uses up the mail provider's 300 a day (ADR-0037), and after that no mail goes out at all,
not even a new Viewer's first link (#88).

**A reset request sends no mail if the Viewer was issued any Password Link in the last
`PASSWORD_RESET_MAIL_WINDOW_SECONDS`.** Five minutes by default. The request still answers `202`
with no body before the address is looked up (ADR-0038). A request that is held back just sends
nothing, the same way an unknown address sends nothing. It writes a `password reset mail held
back` log line with the Viewer's id.

**The check comes before a new link is issued.** So a held-back request issues nothing and ends
nothing. The link the Viewer was last mailed keeps working.

**Any Password Link counts.** That is the one sent when an Administrator created the Viewer as
well as the ones sent for earlier resets, and spent ones as well as unspent ones.
`password_tokens` stores both kinds the same way, and a column saying which is which would be a
second thing to keep right for one check. Counting both gives one cost: a new Viewer whose first
mail was lost has to wait out the window before a reset mails them a new one. The window is
minutes, and the first link keeps working in that time, so we accept it.

**The check runs inside the transaction that issues the link and sends the mail, after a lock
on the Viewer.** Without the lock, several requests at the same moment would each look before
any of them had committed, see no recent link, and each send a mail. The lock is
`pg_advisory_xact_lock` on a hash of the Viewer's id, and it is let go when the transaction ends.
A second request waits, then sees the first one's link, and sends nothing. A send that fails
rolls the transaction back and leaves no link behind, so the next request sends straight away.

**The lock is on the Viewer's id, not on their row.** The transaction stays open while SMTP runs,
which can take seconds (ADR-0038). A lock on the Viewer's row would hold up everything else that
writes that row for that long: Deactivating them, setting their password, changing their role.
The lock on the id holds up only another reset for the same Viewer.

**This is not the lock per account that ADR-0021 turned down.** That lock changed the answer:
"your account is locked" is not the same as "those credentials are not valid", so it told a
caller which addresses have accounts. This cap never changes the answer. And the Viewer is never
left without a link that works, because the mail that started the window carried one.

## What we did not do

**A limit on the whole service's mail per day, below the provider's 300.** It would stop many
Viewers being mailed at once from using up the provider's limit. It is a separate question, moved
to #93.

## Consequences

Requests for the same Viewer at the same moment wait on each other, one at a time. Each one
that waits holds a database connection until the first send ends, as each request in a burst
already did while it sent its own mail (ADR-0038). Once the first commits, the rest end after
one short query. The per-address rate limit bounds how many can pile up.

The wait counts toward the transaction's 20 seconds. One that waits past them is rolled back
and logged as `password reset link not mailed`, and nothing was mailed. If the first send
failed, the next request sends with less of that time left. A send that then outlasts the
transaction mails a link that never works, as ADR-0038 describes, and leaves no link to hold
back the next request.

The lock's key is a 64-bit hash of the id, so two Viewers could in theory share one. Then a reset
for one would wait for a reset for the other. Nothing would go wrong beyond the wait.

Creating a Viewer is not capped. It always sends the first link.
