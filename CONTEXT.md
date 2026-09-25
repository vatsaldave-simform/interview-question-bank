# Interview Question Bank

A shared bank of interview and screening questions, searchable across categories, where
questions tied to a specific client stay visible only to people permitted for that client.

## Language

### The bank

**Question**:
A single interview or screening question, together with its Answer Notes, Tags and Provenance.
It is in the bank once Published, and not before.
_Avoid_: entry, item, record, submission

**Answer Notes**:
The guidance recorded alongside a Question about what a good answer looks like.
_Avoid_: answer, solution, model answer

**Provenance**:
Where a Question came from: written by its Author (Original), reworked from a public work
(Adapted), or carried in from an existing document with its origin unknown (Inherited). Every
Question carries exactly one.
_Avoid_: origin, kind, contribution type, submission type

**Source**:
The public work an Adapted Question was reworked from, named in the Author's own words.
_Avoid_: reference, citation, link, attribution

**Publication State**:
Whether a Question is awaiting a Reviewer (Pending), in the bank (Published), or refused with a
reason the Author can read (Rejected). A Pending or Rejected Question is reachable only by its
Author and by Reviewers.
_Avoid_: status, workflow state, draft, approval status

**Category**:
A named axis along which Questions are classified, such as technology, seniority or question type.
_Avoid_: dimension, facet, group, type

**Tag**:
A single value belonging to exactly one Category. A Question may carry several Tags within a Category.
_Avoid_: label, keyword, topic, term

**Rating**:
One Viewer's opinion of one Question, revisable and never shown attributed: a Question carries
only the average and the count.
_Avoid_: score, vote, review, feedback

### People and access

**Viewer**:
The authenticated person a request acts as. Every request has exactly one; there is no anonymous path.
_Avoid_: user, actor, principal, requester

**Author**:
A Viewer who may add Questions and edit the ones they added.

**Reviewer**:
A Viewer who may edit any Question that is Visible to them, and who alone decides a Question's
Publication State or removes its Client restriction.

**Reader**:
A Viewer who may not add or edit Questions. The constraint is on Question content rather than on
all writes: a Reader may still record a Rating. Named Reader rather than "user" so that "user"
never competes with Viewer.
_Avoid_: user, viewer-only, basic user

**Administrator**:
A Viewer who may create Viewers and Clients, issue and revoke Permission Grants, decide Role
Requests and Deactivate Viewers. Held alongside Reader, Author or Reviewer rather than instead of one, and carrying no
access to Questions of its own.
_Avoid_: admin, superuser, owner, root

**Deactivated**:
A Viewer who can no longer log in, but who remains the Author of everything they wrote and keeps
their name on every Change Event. No Viewer is ever deleted.
_Avoid_: disabled, suspended, removed, archived

**Password Link**:
A mailed link that lets a Viewer set their own password, sent when an Administrator creates them
and when they ask for a reset. It works once, and a newer one ends it.
_Avoid_: reset token, set-password token, reset link, magic link

**Role Request**:
A Viewer's request to hold a different role, granted or denied by an Administrator with a reason
the requester can read. A Viewer holds at most one open Role Request.
_Avoid_: application, promotion, access request

**Client**:
An organisation a Question may be restricted to.
_Avoid_: customer, account, organisation, org

**Permission Grant**:
The authority for one Viewer to see one Client's Questions.
_Avoid_: permission, access, share, entitlement

**Visible**:
A Question is Visible to a Viewer when it is not restricted to a Client, or is restricted to a
Client the Viewer holds a Permission Grant for. Visibility is evaluated before anything else,
on reads and writes alike.
_Avoid_: permitted, allowed, accessible

**Near-Duplicate**:
A Question whose text closely resembles that of another Question, judged only among the Questions
the acting Viewer can reach at the moment the text is written.
_Avoid_: duplicate, similar question, match

### Change tracking

**Change Event**:
An append-only record of something that happened to the bank — a Question submitted, edited,
Published or Rejected, or a submission refused as a Near-Duplicate — carrying who did it and when.
_Avoid_: audit log, history entry, revision, version
