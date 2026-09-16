# Accounts are created by an Administrator; roles are requested and approved

Viewers were seed data, which suffices for grading and not for a second day of use. There is no
self-service registration. An Administrator creates a Viewer and sets an initial role, and the
system emails that person a single-use, time-limited link to set their own password, so the
Administrator never handles the credential.

Open registration was rejected, and it is worth being precise about why. A stranger who registered
would see only unrestricted Questions — Permission Grants protect Client material regardless of who
holds an account. The exposure is the organisation's own interview questions, and a candidate
reading them the night before their interview is the failure being guarded against. Restricting
registration to the organisation's email domain would have narrowed that; creation by an
Administrator closes it, and costs one action per hire on a system where an Administrator already
assigns roles, issues Permission Grants and deactivates people.

A Viewer may request a different role, which an Administrator grants or denies with a reason the
requester can read. There is no ladder — a Reader may request Reviewer directly — because an
Administrator already sets any initial role at creation, and enforcing an order on requests while
creation ignores it would be incoherent. A Viewer holds at most one open Role Request at a time.

## Consequences

The project acquires an outbound email dependency it did not have. ADR-0009 kept the infrastructure
deliberately thin, so this is a considered exception rather than an oversight; it carries password
reset as well as the initial set-password link, which is what makes it worth more than having an
Administrator pass a temporary credential out of band.

Password reset answers identically whether or not the address belongs to a Viewer, and whether or
not that Viewer is Deactivated. A project whose central guarantee is that a restricted Question is
indistinguishable from one that does not exist should not hand out an account oracle on its login
page.

An Administrator gains a second queue, beside the Reviewer's Pending Questions.
