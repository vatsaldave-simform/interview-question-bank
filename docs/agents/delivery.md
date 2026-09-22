# Delivery

Issue titles, branch names, commit messages and PR descriptions follow
`docs/agents/plain-language.md` like everything else a person reads.

How a ticket becomes code. One ticket is one branch and one pull request, built as several small
commits — one chunk each, every one small enough to review in one sitting.

## One commit, one concern

A commit carries **one reviewable concern**: one question a reviewer holds in their head while
reading it. "Is the data model right?" and "is the crypto right?" and "is the HTTP contract
right?" are three concerns, not one, even when they land in the same feature. A reviewer reads the
PR commit by commit and meets them one at a time.

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

Carving the work into chunks after the code exists does not work — by then everything touches
everything. That is where 1600-line branches come from. The plan is what keeps the commits
separable, so it is still written and approved first even though they now share one branch.

Each chunk commit references the plan: `chunk 2 of #<n>`.

## One chunk at a time, in order

Write chunk N+1 on top of chunk N, committed, on the same branch. In order, because a later chunk
usually builds on an earlier one and the commits have to read that way.

Do not let the chunks blur into each other. Finish one, commit it, then start the next — a single
commit holding two chunks cannot be un-mixed later, and that is the whole point of the split.

## What a chunk must clear

- Its tests pass, and it stands on its own: a reviewer can check out that commit and typecheck it.
- It does **not** need to ship user-visible behaviour. A tested primitive with no caller yet is
  fine — demanding end-to-end value per chunk is exactly what forces fat commits in a layered
  backend.
- The ticket runs to completion. Do not leave a branch half-built and move to another ticket.

## What the PR must clear

- It merges, the whole suite passes, CI is green.
- Its description lists the chunks and what each one asks a reviewer, so the commit-by-commit
  reading is obvious to whoever opens it.

## Commits and PRs wait for approval

Work on a branch, never on `main`. One branch per ticket, off `main`, named in plain words like
the ones already here: `feat/question-list-http`.

There are two approvals, and they are separate:

1. **Commit** once the maintainer approves the work.
2. **Open the PR** against `main` once they approve that too. Approving the code is not
   approving the PR.

So: branch, write the code, run the tests, then stop and ask. Commenting on issues with
`gh issue comment` needs no approval.

Commit messages and PR descriptions name no tool and no assistant — no `Co-Authored-By` line,
no "generated with" footer. Who wrote a line is in the blame; what a reader needs from a commit
message is why the line is there.

## Worked example

PR #44 shipped login as 1287 lines across 45 files in one commit: schema, password hashing, token
signing, middleware, routes and a seed script. Under this document it is one PR of three commits:

| Chunk | Contents | ~src lines |
| --- | --- | --- |
| 1 | Viewer schema + migration, seed script, seeded credentials | 120 |
| 2 | Password hashing and access-token sign/verify as pure units, with tests and ADR-0019 | 180 |
| 3 | Login route, auth middleware, `authenticated-viewer`, HTTP setup | 170 |
