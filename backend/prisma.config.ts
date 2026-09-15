import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// The CLI runs from backend/, the environment file sits at the workspace root.
const rootEnvFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

// `prisma generate` needs no database, and it runs on a clean checkout before anyone
// has written a .env, so the datasource is only declared when there is a URL to
// declare. Commands that do connect fail with Prisma's own message about the missing
// datasource, which is clearer than a placeholder URL that cannot work.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
