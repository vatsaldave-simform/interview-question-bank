# The router is TanStack Router, and the routes are written in code

Picking a router is usually a shrug. It is not here, because of one line in #14: the current view is
reflected in the URL, so it can be bookmarked or shared. That view is Tags chosen across several
Categories, a keyword search and a page number, and it has to survive a reload. Every part of the
browse ticket except that one is ordinary work.

A router that hands the query string back as strings makes each screen read it, check it, turn it
into the shape the API wants, and write it back on every change — by hand, in one place per screen,
with nothing to catch it when a parameter is renamed. TanStack Router treats the query string as
real state instead: a route declares what its parameters are with a zod schema, the router refuses
anything that does not fit, and screens read typed values back. It also knows when a change to those
parameters should reload the data, which matters because #13 already chose TanStack Query to hold
that data. This is the whole reason for the choice.

**The routes are written in code, not as files.** File-based routing is the library's own default
and the thing most of its documentation shows. It is refused here on purpose. A directory tree whose
shape is dictated by URLs would pull screens back out of the feature folders ADR-0030 just drew, and
the repo would carry two competing layouts — the real one under `features/`, and a second one that
looks authoritative because the router reads it. Written in code, a route is an ordinary module:
each feature exports its routes from its own `.routes.tsx`, and `routes.tsx` at the root of `src`
puts them together. That is `api.routes.ts` on the other side of the repo, doing the same job.

## Consequences

A feature owns the zod schema for its own search parameters, in a `.schema.ts` beside its routes.
That is what the suffix is for, and it is the one kind of schema the frontend writes for itself
rather than taking from `@iqb/shared` — a filter lives in the URL, not in an API response.

`routes.tsx` is the only place the whole URL shape of the application is visible at once. Keep it
that way: a route defined somewhere else is invisible to the person trying to find out what
addresses exist.

Two costs are real. TanStack Router is the less common pick, so a search for a problem returns fewer
answers than React Router would. And code-defined routes are the less-travelled path inside the
library, so most examples found online are in the file-based form and need translating — including
the parent-route argument that every code-defined route has to carry and file-based routes do not.
`docs/agents/frontend-structure.md` therefore names the `tanstack-router` skill as something to read
before touching routes, rather than as a suggestion.

Going to file-based routing later would be a real migration, not a setting. That is the point: it
would also mean giving up the layout, so the two decisions stand or fall together.
