# The frontend is laid out by feature too, and names those features after the bank

ADR-0020 laid `backend/src` out by feature instead of by layer, and that argument holds here without
being made twice: one folder per concern reads better at forty files than five folders full of
near-identical names. What is worth writing down is the three questions the frontend has to answer
and the backend never did.

`frontend/src` takes the same shape. `features/<name>/` holds one concern end to end — its screens,
its forms, its data-fetching hooks. `platform/` holds what no concern owns: the API client, the
access token, the query client, the app shell, the sign-in check and the error boundary. `main.tsx`
mounts the root, `App.tsx` holds the order the providers wrap in, and `routes.tsx` assembles the
route tree out of what the features export; those three answer to `index.ts`, `app.ts` and
`api.routes.ts` on the other side. There is a third zone, `ui/`, because the frontend has files
nobody here wrote.

**Features are named after the bank, not after the screens.** The tickets are titled by activity —
browse, contribute, review, ratings — and it is tempting to make each one a folder. `CONTEXT.md`
has no Browse in it. All four are views of the same concern, so under activity names they would be
four supposedly independent folders sharing the Question type, the same query hooks and the same
Question card. They are one folder, `features/questions/`, and the screens are told apart by a
prefix on the filename. The administration console is not a feature either: ADR-0015 put
administration beside the roles rather than above them, so it is a route that assembles
`features/viewers/` and `features/clients/`.

**The sign-in check sits in `platform/`.** It reads the access token, which the API client reads
too, so it passes the test ADR-0020 set — would a second feature want this? Every feature's routes
want it. Putting it in `features/auth/` would make every other feature import from a feature, which
is the one direction the zones forbid. `features/auth/` still owns the login screen the check sends
people to.

**`ui/` starts with only `shadcn/` inside it.** A hand-written component moves up into `ui/` when a
second feature imports it, and not before — the same restraint ADR-0020 used to refuse a service
layer, for the same reason: a folder created empty gets filled by whatever is open that week. The
generated components sit under `ui/shadcn/` from the first commit rather than being moved there
later, so "this folder is machine-written, do not edit it" describes a whole folder and stays true
from the start.

## Consequences

Features may import from `platform/` and from `ui/`, and from another feature where the domain
really does depend that way. Nothing in `platform/` or `ui/` may import from a feature. This is a
written rule with no tool behind it, as on the backend.

`features/questions/` will be the largest folder in the repo by some distance, because four tickets
build inside it. That is expected rather than a sign the concern needs splitting, and the filename
prefix is what keeps the listing readable.

Imports inside `frontend/src` are written `@/`-prefixed and carry no `.js` extension, unlike every
other package here. `shadcn add` writes its components that way, and correcting the generator on
every component costs more than one stated difference does.

The rules this implies — where a new file goes, the closed list of filename suffixes, how files are
named and where tests live — are in `docs/agents/frontend-structure.md`, because they are
instructions to follow rather than a decision to remember.
