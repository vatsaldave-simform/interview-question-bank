import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** Once no code read them, the old Client column and the Grant table went (ADR-0051).
 * Read from the database itself, which is what the migration changes. */
describe("the database after the old Client column and Grants are dropped", () => {
  let database: Database;

  beforeAll(() => {
    database = createTestDatabase();
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("has no Client column on questions", async () => {
    const columns = await database.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'questions'
    `;

    expect(columns.map(({ column_name }) => column_name)).not.toContain("clientId");
  });

  it("has no permission_grants table", async () => {
    const tables = await database.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'permission_grants'
    `;

    expect(tables).toEqual([]);
  });
});
