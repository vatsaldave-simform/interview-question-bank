# The last-Administrator check locks its rows in one statement, ordered by id

ADR-0015 says the last active Administrator cannot be removed. Withdrawing and Deactivating
check that rule by counting the other active Administrators, then writing. Before this
decision the count took no lock, and the transaction ran at PostgreSQL's default isolation
(READ COMMITTED). Two requests could both count, both see one other Administrator, and both
write. If Administrators A and B each removed the other at the same moment, nobody was left who
could log in and appoint a replacement. No endpoint can repair that.

The same gap let two Deactivations of one Viewer both pass the "already done?" check and each
record a `viewer_deactivated` Change Event (#86).

**Before any check, the transaction locks the target and every active Administrator with
`SELECT … FOR NO KEY UPDATE`.** A second request that needs any of those rows waits until the
first commits. It then reads the target and counts again, and it sees what the first request wrote.
So when A's request has withdrawn B, B's request finds that A is the only active Administrator
left, and it is refused with the usual 409.

**The lock is one statement, ordered by `id`.** Say the target were locked first and the
Administrators second. A's request would hold B's row while B's request held A's, and each would
wait on the other. PostgreSQL ends a deadlock by cancelling one of the two, and that caller
would get a 500. With one statement and a fixed order, both requests reach for the same first
row. One gets it and the other waits there, holding nothing the first one needs.

**The lock is `NO KEY UPDATE`, not `UPDATE`.** Inserting a row that points at a Viewer, such
as a Change Event naming the acting Administrator, takes a light share lock on that Viewer's row.
`FOR UPDATE` waits on that share lock, and `FOR NO KEY UPDATE` does not. With `FOR UPDATE`, a
role change that had written B's row but not yet its Change Event naming A would deadlock with a
withdrawal that had locked A and was waiting on B. `NO KEY UPDATE` still makes two of these locks
wait for each other, and that is all the rule needs.

**The target is read after the lock, not before the transaction.** A read from before the wait
can be out of date by the time the write runs.

## What we did not do

**Serializable isolation with a retry.** It would also close the gap. But it needs a retry loop
around the transaction, and a way to tell a failure to serialize from any other error. That is a
bigger change for two admin acts that are rare.

## Consequences

Withdrawing an Administrator and Deactivating a Viewer each wait for any other one still
running, even one that has nothing to do with it. Both are rare, and each transaction is a
handful of short statements. Apart from the three acts in the next paragraph, nothing else waits
on these locks: a login, a new Question and a Change Event can still point at any of the locked
rows.

Appointing, changing a role and reactivating cannot break the last-Administrator rule, but the
same gap let two of them on one Viewer record a Change Event twice (#90). So they too read the
target after a `NO KEY UPDATE` lock, inside their transaction. They lock only the target's row.
None of them removes an Administrator, so they have no count to guard. They wait for another act
on the same Viewer, and for a withdrawal or Deactivation while that Viewer is an active
Administrator. They cannot deadlock with either: each holds one row, and the Change Event it then
writes takes only the light share lock that `NO KEY UPDATE` does not wait on.

The acting Viewer's own authority is still checked before the transaction. So a request from B
may go ahead a moment after B lost the authority. The lock still leaves one active
Administrator, and that is the rule this decision protects.

The suite drives each race by calling the service twice at once, and checks the rule that must
hold afterwards (ADR-0023). Before this change the races went wrong on nearly every run, so
those tests fail without the lock. The deadlock with a role change needs one exact order of
steps, so its test holds the role change in place by hand until the withdrawal is waiting.
