# Home is put together beside the route assembly

#149 adds Home, the first screen after sign-in. It shows a search box, the newest Questions,
shortcuts for the Viewer's role, and later the work waiting for each role. Each of those comes
from a different feature: the newest Questions from `features/questions/`, open Role Requests
from `features/role-requests/`, and so on.

ADR-0030 puts a screen inside the feature it belongs to. Home belongs to none of them.

**Each panel stays in the feature that owns its data. One file, `src/home-page.tsx`, arranges
them into the page.** It sits beside `src/routes.tsx`, because it is the same kind of file: put
together from several features, and owned by none. `routes.tsx` sets up its route at `/`.

## Why here

A panel needs its feature's query hooks, its card and its wording. Kept in the feature, it can
use them without exporting them for one outside caller. When the list behind a panel changes,
the panel changes in the same folder.

The page itself only places panels. It holds no data and no rules of its own. That is why it
can sit at the root of `src` without growing into a second feature.

## What we did not do

**A `features/home/` folder.** Features are named after the bank, not after the screens
(ADR-0030). Home is not a concern from `CONTEXT.md`. A folder for it would pull in panels from
every feature, and then it would depend on all of them.

**Put Home in `features/questions/`.** Questions are only one of the panels. The Role Request
panels would then make the Questions feature depend on the Role Request one, for no reason the
bank gives.

**Put Home in `platform/`.** Nothing in `platform/` may import a feature (ADR-0030), and Home
has to import several.

## Consequences

- A new Home panel goes in the feature whose list it shows, and `home-page.tsx` places it.
- The shortcuts read only the Viewer's role and link to addresses, like the sidebar. So they
  sit in `platform/` beside it.
- Browse lived at `/` before Home. A `/` address that carries a filter still goes to
  `/questions` with the same filter, so links saved then keep working.
- `docs/agents/frontend-structure.md` lists `home-page.tsx` in its tree.
