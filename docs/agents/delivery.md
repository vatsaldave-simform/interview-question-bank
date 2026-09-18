# Delivery

Issue titles, branch names, commit messages and PR descriptions follow
`docs/agents/plain-language.md` like everything else a person reads.

How a ticket becomes code. One ticket is normally several pull requests, each small enough to
review in one sitting.

## One PR, one concern

A pull request carries **one reviewable concern**: one question a reviewer holds in their head
while reading it. "Is the data model right?" and "is the crypto right?" and "is the HTTP contract
right?" are three concerns, not one, even when they land in the same feature.

There is no line cap. A concern that honestly needs 600 lines ships as 600 lines.

**The tripwire**: when a chunk's hand-written source passes roughly **400 lines** — excluding
tests, `pnpm-lock.yaml`, Prisma migrations, `backend/src/generated/`, docs and ADRs — stop and
re-examine the split. It is not a veto. It is a requirement to say out loud, in the chunk plan, why
this is still one concern.

Workspace bootstrap is the standing exception: lockfiles, compose files and tsconfigs arrive
together or not at all.

## Plan the chunks before writing code

1. Read the ticket (`gh issue view <n> --comments`).
2. Post the chunk plan as a comment on that ticket (`gh issue comment <n>`). For each chunk: what
   it contains, the estimated hand-written source lines, and what it deliberately leaves out.
3. **Wait for the plan to be approved.** Do not start chunk 1 before then.

Carving a branch into PRs after the code exists does not work — by then everything touches
everything. That is where 1600-line branches come from.

Each chunk PR references the plan: `chunk 2 of #<n>`.

## One chunk at a time, sequential to `main`

Chunk N+1 branches off `main` **after chunk N is merged**, so review feedback lands before anything
is built on top of it. Do not build the next chunk locally on top of an unmerged one; that is how a
large working tree reappears under a new name.

Stacked PRs are for when a later chunk genuinely cannot wait on review of an earlier one. They are
not the default — every rebase after a review comment cascades through the stack.

## What a chunk must clear

- It merges, its tests pass, CI is green.
- It does **not** need to ship user-visible behaviour. A tested primitive with no caller yet is
  fine — demanding end-to-end value per chunk is exactly what forces fat PRs in a layered backend.
- The ticket runs to completion. Do not leave a stack half-landed and move to another ticket.

## Commits and PRs are the maintainer's to make

Write the code and hand over the commit message. Do not run `git commit`, push, or open the PR.
Commenting on issues with `gh issue comment` is fine.

## Worked example

PR #44 shipped login as 1287 lines across 45 files: schema, password hashing, token signing,
middleware, routes and a seed script. Under this document it is three PRs:

| Chunk | Contents | ~src lines |
| --- | --- | --- |
| 1 | Viewer schema + migration, seed script, seeded credentials | 120 |
| 2 | Password hashing and access-token sign/verify as pure units, with tests and ADR-0019 | 180 |
| 3 | Login route, auth middleware, `authenticated-viewer`, HTTP setup | 170 |
