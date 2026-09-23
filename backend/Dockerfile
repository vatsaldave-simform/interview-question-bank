# Built from the workspace root, because the API is a workspace package that depends on
# the shared schema package (ADR-0010), and because one origin serves both the API and
# the built client (ADR-0012) — so the client is built here too.

# The Node version matches .nvmrc at the root. Docker cannot read that file, so both
# stages below name it again. Keep these two in step with .nvmrc.

# ---------------------------------------------------------------------- builder
FROM node:24-alpine AS builder

# corepack is experimental in Node 24 and gone in 25, so pnpm comes from npm instead.
# Keep this version the same as `packageManager` in the root package.json.
RUN npm install -g pnpm@11.27.1
WORKDIR /app

# Manifests first, so a source change does not reinstall the world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN pnpm --filter @iqb/shared build \
 && pnpm --filter @iqb/backend db:generate \
 && pnpm --filter @iqb/backend build \
 && pnpm --filter @iqb/frontend build

# One self-contained directory holding the API and only the dependencies it needs at
# run time, with @iqb/shared injected rather than symlinked out of the workspace.
#
# This is `pnpm deploy` rather than `pnpm prune --prod` for two reasons, both learned
# the hard way: prune acts on the project it runs in, which here is the root, and the
# root has no dependencies; and copying `node_modules` from a pnpm workspace copies the
# whole `.pnpm` virtual store, so what the symlinks point at is irrelevant to the size
# of the image. `deploy` builds a tree scoped to production from the outset.
#
# `--ignore-scripts` because the backend's `postinstall` runs `prisma generate`, and the
# deploy folder has no `prisma` command to run it with. The client was generated above.
RUN pnpm --filter @iqb/backend deploy --prod --ignore-scripts /app/deploy

# ---------------------------------------------------------------------- runtime
FROM node:24-alpine AS runtime

WORKDIR /app

# The client the API serves. Unset, the API would serve no client at all, so this is
# what makes the deployed image a single origin rather than a bare API.
ENV FRONTEND_DIR=/app/frontend/dist

# No client bundler and no test runner: `--prod` above left them behind. The Prisma CLI
# package and TypeScript are still here, because pnpm 11 keeps them as optional peers of
# `@prisma/client` (ADR-0033). Nothing runs them: the API's own code never loads the CLI.
# Migrations belong to whoever is deploying, not to the server process, so they run
# elsewhere: a one-shot compose service locally, and the CI workflow for the deployment
# (ADR-0012).
COPY --from=builder /app/deploy ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist

USER node
WORKDIR /app/backend
EXPOSE 3000

# `node` directly rather than through a shell or through pnpm: it takes PID 1, so the
# SIGTERM compose and Render send reaches the graceful shutdown rather than stopping at
# a shell that would not forward it. Nothing runs before it, which is why a cold start
# on a tier that has many of them costs only the server coming up.
CMD ["node", "dist/index.js"]
