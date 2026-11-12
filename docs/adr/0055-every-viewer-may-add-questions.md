# Every Viewer may add Questions

Until now a Viewer was a Reader, an Author or a Reviewer. A Reader could only read and upvote.
**Now there is no Reader. Every Viewer who is not a Reviewer is an Author**, and may add
Questions and edit the ones they added.

The split no longer protected anything. A new Question is Pending until a Reviewer Publishes it
(ADR-0013), so nothing an Author adds reaches the bank unchecked. Keeping a role whose only
limit was "may not add" cost a Role Request and an Administrator's time for every Viewer who
wanted to add one Question, and guarded nothing in return.

## What the migration does

- **Every Viewer who is a Reader becomes an Author.** No `role_changed` Change Event is written.
  A Change Event names the Viewer who did it, and a migration is not a Viewer. This ADR is the
  record instead.
- **Every open Role Request for the Reader role is denied**, with the reason "The Reader role no
  longer exists." The Viewer who asked can still read it, as with any denied request. No
  `role_request_denied` Change Event is written, for the same reason as above.
- **`reader` stays in the database's `ViewerRole` enum as a retired value.** Decided Role
  Requests that asked for it keep it, so history still says what was asked for. The API's
  `ViewerRole` loses it, so nothing accepts or writes it again. Only the type for a Role
  Request's asked-for role still includes it, so old requests can be shown. ADR-0051 keeps old
  Change Event types for the same reason.

## What we did not do

**Rewrite old Role Requests from `reader` to `author` and drop the value.** A Viewer who asked to
step down to Reader would then seem to have asked to become an Author. That changes what they
asked for.

**Make Reviewer a flag beside the role, like Administrator (ADR-0015), and drop the role enum.**
This is cleaner on paper. But a Role Request asks for a role, so it would have to change into
something else. Keeping a two-value enum leaves Role Requests and ADR-0015 as they are.

**Rename Author.** "Author" means both the role and "the Author of a Question". After the merge
the role name says less, since nearly everyone holds it. But the double meaning was there before,
and the merge does not make it worse.

## Consequences

- Nobody can tell afterwards who used to be a Reader. Bringing back a read-only role would mean
  choosing again, Viewer by Viewer.
- The `reader@iqb.test` demo login and seed go away. The hosted seed lists its three readers as
  Authors. It never touches a Viewer that already exists, so the migration is what changes the
  ones already hosted.
- ADR-0015's three-step ladder is now two steps: Author and Reviewer.
