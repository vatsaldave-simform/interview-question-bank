# Built from the workspace root, because the API is a workspace package that depends on
# the shared schema package (ADR-0010).
FROM node:20-alpine

RUN corepack enable
WORKDIR /app

# Manifests first, so a source change does not reinstall the world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --ignore-scripts \
      --filter @iqb/shared --filter @iqb/backend

COPY shared ./shared
COPY backend ./backend

RUN pnpm --filter @iqb/shared build \
 && pnpm --filter @iqb/backend db:generate \
 && pnpm --filter @iqb/backend build

USER node
WORKDIR /app/backend
EXPOSE 3000

# Migrations run at start, so `docker compose up` against an empty database needs no
# manual step. Both commands are the binaries themselves rather than `pnpm`, because
# pnpm arrived through corepack as root and this stage runs as `node`, which cannot
# read root's corepack cache. `exec` then hands PID 1 to node, so the SIGTERM compose
# sends reaches the graceful shutdown instead of stopping at the shell.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
