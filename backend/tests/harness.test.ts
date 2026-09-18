import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "./helpers/test-api.js";
import { testDatabaseUrl } from "./helpers/test-database.js";
import { withDatabaseUrl } from "./helpers/with-env.js";

/**
 * The harness every later ticket builds on: a real application, a real database, and
 * an empty one at the start of each test. The probe table stands in for the tables the
 * Viewer and Question tickets will add, and proves the truncation finds tables it was
 * never told about.
 */
describe("the test harness", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await api.database.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS harness_probe (id bigserial PRIMARY KEY, note text NOT NULL)",
    );
  });
  beforeEach(async () => {
    await api.truncate();
  });
  afterAll(async () => {
    await api.database.$executeRawUnsafe("DROP TABLE IF EXISTS harness_probe");
    await api.stop();
  });

  it("starts each test with an empty database", async () => {
    expect(await probeRows(api)).toEqual([]);

    await api.database.$executeRawUnsafe("INSERT INTO harness_probe (note) VALUES ('written')");

    expect(await probeRows(api)).toEqual([{ note: "written" }]);
  });

  it("does not see what the previous test wrote", async () => {
    expect(await probeRows(api)).toEqual([]);
  });

  it("restarts identity columns, so ids start from the same place in every test", async () => {
    await api.database.$executeRawUnsafe("INSERT INTO harness_probe (note) VALUES ('first')");

    const [row] = await api.database.$queryRawUnsafe<{ id: bigint }[]>(
      "SELECT id FROM harness_probe",
    );
    expect(row?.id).toBe(1n);
  });

  it("refuses to run against a database that is not named as a test database", async () => {
    await withDatabaseUrl("postgresql://iqb:iqb@localhost:5432/iqb", async () => {
      expect(() => testDatabaseUrl()).toThrow(/must contain "test"/);
    });
  });
});

function probeRows(api: TestApi): Promise<{ note: string }[]> {
  return api.database.$queryRawUnsafe<{ note: string }[]>(
    "SELECT note FROM harness_probe ORDER BY id",
  );
}
