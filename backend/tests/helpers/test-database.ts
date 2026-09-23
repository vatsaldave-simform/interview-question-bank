import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { createDatabase, type Database } from "../../src/platform/database.ts";

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

/**
 * An empty scratch database on the same server, for the check that replays the whole
 * migration history somewhere it cannot harm anything. Dropped and remade each time, so
 * the replay starts from nothing; the name carries "test" like the suite's own.
 */
export async function makeShadowDatabase(database: Database): Promise<string> {
  const url = new URL(testDatabaseUrl());
  const name = `${url.pathname.replace(/^\//, "")}_shadow`;

  // Not parameters: a database name cannot be one, and both parts are built here rather
  // than taken from a request.
  await database.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await database.$executeRawUnsafe(`CREATE DATABASE "${name}"`);

  url.pathname = `/${name}`;
  return url.toString();
}

/** A database that keeps every statement it sends, so a test can assert what the query
 * function asked PostgreSQL for and not only what came back. */
export type SqlLoggingDatabase = { database: Database; statements: string[] };

/** Built here rather than by `createDatabase`, because logging every statement is a
 * thing the suite wants and nothing in the running API does. */
export function createSqlLoggingDatabase(): SqlLoggingDatabase {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl(), max: 5 }),
    log: [{ emit: "event", level: "query" }],
  });
  const statements: string[] = [];
  client.$on("query", (event) => statements.push(event.query));
  return { database: client, statements };
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
