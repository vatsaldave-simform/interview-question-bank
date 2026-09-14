# Interview Question Bank

A shared bank of interview and screening questions, searchable across categories, where
questions tied to a specific client stay visible only to people permitted for that client.

## Language

### The bank

**Question**:
A single interview or screening question held in the bank, together with its Answer Notes and Tags.
_Avoid_: entry, item, record

**Answer Notes**:
The guidance recorded alongside a Question about what a good answer looks like.
_Avoid_: answer, solution, model answer

**Category**:
A named axis along which Questions are classified, such as technology, seniority or question type.
_Avoid_: dimension, facet, group, type

**Tag**:
A single value belonging to exactly one Category. A Question may carry several Tags within a Category.
_Avoid_: label, keyword, topic, term

### People and access

**Viewer**:
The authenticated person a request acts as. Every request has exactly one; there is no anonymous path.
_Avoid_: user, actor, principal, requester

**Author**:
A Viewer who may add Questions and edit the ones they added.

**Reviewer**:
A Viewer who may edit any Question that is Visible to them.

**Reader**:
A Viewer with read-only access. Named Reader rather than "user" so that "user" never competes with Viewer.
_Avoid_: user, viewer-only, basic user

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
A Question whose text closely resembles that of another Question already in the bank, judged
only among Questions Visible to the submitting Viewer.
_Avoid_: duplicate, similar question, match

### Change tracking

**Change Event**:
An append-only record of something that happened to the bank — a Question added, a Question
edited, or a submission rejected as a duplicate — carrying who did it and when.
_Avoid_: audit log, history entry, revision, version
