import { createDatabase, type Database } from "../../src/db/prisma.js";

/**
 * The suite truncates whatever it connects to, so it refuses to connect to anything
 * that is not named like a test database. A mistyped URL then fails loudly instead of
 * emptying a database someone was using.
 */
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.test at the workspace root, " +
        "or start the test database with `docker compose up db-test`.",
    );
  }
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run the suite against the database "${name}": its name must contain ` +
        `"test", because every test truncates it.`,
    );
  }
  return url;
}

/**
 * `applicationName` tags this client's connections in `pg_stat_activity`, which is how
 * a test can watch the pool open and close from outside the process.
 */
export function createTestDatabase(applicationName?: string): Database {
  const url = new URL(testDatabaseUrl());
  if (applicationName) url.searchParams.set("application_name", applicationName);
  // Small on purpose: the suite runs files one at a time, and a test that watches
  // the pool open and close in pg_stat_activity wants a number it can reason about.
  return createDatabase(url.toString(), { poolMax: 5 });
}

/** Connections this database is holding open under the given application name. */
export async function connectionCount(database: Database, applicationName: string): Promise<number> {
  const [row] = await database.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM pg_stat_activity WHERE application_name = ${applicationName}
  `;
  return Number(row?.count ?? 0);
}

/**
 * Empties every table the migrations created, in one statement. The table list is read
 * at truncation time rather than cached, so a table added by a later migration is
 * cleaned without anyone remembering to add it here.
 */
const truncateEverything = `
DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`;

export async function truncateAll(database: Database): Promise<void> {
  await database.$executeRawUnsafe(truncateEverything);
}
