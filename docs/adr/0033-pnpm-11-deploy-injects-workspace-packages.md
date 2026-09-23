# On pnpm 11, `pnpm deploy` works because workspace packages are injected

This replaces the `pnpm deploy` part of ADR-0012. The rest of ADR-0012 still holds, and the file
itself is left as it was.

The image builds its runtime folder with `pnpm --filter @iqb/backend deploy --prod` (ADR-0012).
From pnpm 10 on, `deploy` in a workspace stops unless one of two things is true: the workspace sets
`injectWorkspacePackages: true`, or the command asks for the old behaviour with `--legacy`.

**We set `injectWorkspacePackages: true` in `pnpm-workspace.yaml`.** With it, `deploy` builds the
folder from the workspace's own lockfile. `@iqb/shared` is copied into the folder rather than
linked out of the workspace, which is what the image needs anyway.

## Why not the other two ways

**`--legacy`.** This is the old `deploy`, kept so that older setups still work. When the new one
fails, pnpm itself offers it only as a workaround. We measured it, and it gives no benefit: the
image is the same size, with the same packages in it. So we take the way pnpm now expects.

**pnpm 12.** It came out in August 2026 and is a rewrite. Moving from 11 to 12 is its own small
ticket, done later. It is not needed to make `deploy` work.

## What else changed in the image

**`deploy` now skips scripts.** pnpm 11's `deploy` runs the backend's `postinstall`, which is
`prisma generate`. The deploy folder has the `prisma` package, but no `prisma` command on its
path, so the build failed. The Prisma client is already generated earlier in the same stage, and
the install before it already uses `--ignore-scripts`. So `deploy` uses it too.

**The image is 675MB, up from 623MB.** pnpm 11 keeps two optional peers of `@prisma/client` in
the production folder: the `prisma` package (about 41MB) and `typescript` (about 23MB). pnpm 9 left
them out. The backend lists both as dev dependencies. So the shared lockfile links them to
`@prisma/client` as peers. `deploy` keeps those links. Nothing in the image runs either of them.
`--legacy` gives the same 675MB, so injection is not the cause.

The two sizes are for the same source: `main` built with pnpm 9.15.9, and this change built with
pnpm 11.27.1, on the same machine on 2026-09-23. ADR-0012 records 568MB. That was measured
earlier, and the code has grown since. On 2026-09-23, `main` built with the same pnpm 9 setup
came to 623MB. So the growth from pnpm 11 is 52MB, not 107MB.

ADR-0012 said about 125MB of the image was store entries that nothing linked to, such as
`@prisma/studio-core`, and gave a check: whether `node_modules/.pnpm` holds
`@prisma+studio-core`. It still does. The difference is that it is now linked, through the `prisma`
peer. So the first step to getting that space back is keeping `prisma` out of the production
folder. That is left for a later ticket.

## Consequences

- In a local install, `backend/` and `frontend/` still link to `shared/`, so a rebuild of
  `shared` shows up at once, as before. Checked after the upgrade.
- The Dockerfile installs pnpm with `npm install -g pnpm@11.27.1`, because corepack is
  experimental in Node 24 and gone in 25. That version and `packageManager` in the root
  `package.json` must be changed together. Nothing checks this.
- pnpm 11's safety defaults stay on. One of them waits a day before it uses a new release. Two
  packages already in the lockfile were newer than that on the day of the upgrade, so those exact
  versions are listed in `minimumReleaseAgeExclude`. Once they are older than a day, the list
  does nothing and can be deleted.
- The image's comments no longer say it holds no Prisma CLI. The API still never runs it, and
  migrations still run outside the image (ADR-0012).
