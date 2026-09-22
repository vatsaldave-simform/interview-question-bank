import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  capturePlan,
  readPlan,
  scenariosForTheBank,
  vacuumAndAnalyze,
} from "../src/features/questions/query-plans.js";
import { seedBulkBank } from "../src/features/questions/bulk-bank.seed.js";
import type { Database } from "../src/platform/database.js";
import { seedTheBank } from "./helpers/question-bank.js";
import { createTestDatabase } from "./helpers/test-database.js";

/** Trimmed from a real capture, keeping the lines the summary is read from. */
const usingAnIndex = `
Nested Loop Left Join  (cost=1395.39..2827.86 rows=50 width=337) (actual time=0.660..2.372 rows=50 loops=1)
  Buffers: shared hit=1088
  ->  Bitmap Index Scan on "question_tags_tagId_questionId_idx"  (cost=0.00..9.79 rows=183 width=0)
        Buffers: shared hit=4
  ->  Index Scan using questions_pkey on questions q_1  (cost=0.29..5.99 rows=1 width=274)
        Buffers: shared hit=676
Planning Time: 0.412 ms
Execution Time: 2.539 ms
`;

const readingTheWholeTable = `
Limit  (cost=2510.12..2510.24 rows=50 width=337) (actual time=41.201..41.233 rows=50 loops=1)
  Buffers: shared hit=1200 read=372
  ->  Seq Scan on questions q  (cost=0.00..2401.00 rows=5012 width=274)
        Filter: ("searchVector" @@ '''test'''::tsquery)
Planning Time: 0.180 ms
Execution Time: 41.660 ms
`;

describe("reading a captured plan", () => {
  it("takes the time the query actually ran for, not the time it was planned in", () => {
    expect(readPlan(usingAnIndex).milliseconds).toBe(2.539);
  });

  it("counts pages found in the cache and pages read from disk together", () => {
    // The top node's count already includes its children, so only the first line counts.
    expect(readPlan(usingAnIndex).buffers).toBe(1088);
    expect(readPlan(readingTheWholeTable).buffers).toBe(1572);
  });

  it("names every index the plan used, however it reached it", () => {
    expect(readPlan(usingAnIndex).indexes).toEqual([
      '"question_tags_tagId_questionId_idx"',
      "questions_pkey",
    ]);
  });

  it("says whether the whole questions table was read", () => {
    expect(readPlan(usingAnIndex).readsTheWholeTable).toBe(false);
    expect(readPlan(readingTheWholeTable).readsTheWholeTable).toBe(true);
    expect(readPlan(readingTheWholeTable).indexes).toEqual([]);
  });
});

describe("capturing a plan", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
    // Far smaller than a bank worth drawing a conclusion from. This asks whether the
    // harness runs and reads its own output, not how fast anything is.
    await seedBulkBank(database, { count: 400, seed: "a-test-of-the-plan-harness" });
    await vacuumAndAnalyze(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("measures the statement the search sends, for every scenario", async () => {
    const scenarios = await scenariosForTheBank(database);

    for (const scenario of scenarios) {
      const captured = await capturePlan(database, scenario);

      expect(captured.scenario.name).toBe(scenario.name);
      expect(captured.plan).toContain("Execution Time:");
      expect(captured.milliseconds).toBeGreaterThan(0);
      expect(captured.buffers).toBeGreaterThan(0);
    }
  });

  it("aims the scenarios at Tags the bank actually carries, and at all three roles", async () => {
    const scenarios = await scenariosForTheBank(database);

    const named = scenarios.flatMap((scenario) =>
      scenario.search.tagsPerCategory.flatMap((category) => [...category.tagIds]),
    );
    expect(await database.tag.count({ where: { id: { in: named } } })).toBe(
      new Set(named).size,
    );
    expect(new Set(scenarios.map((scenario) => scenario.viewer.role))).toEqual(
      new Set(["reader", "author", "reviewer"]),
    );
  });

  it("asks each scenario for a different part of the bank", async () => {
    const scenarios = await scenariosForTheBank(database);

    // The role counts: three scenarios ask the same thing as different Viewers, and the
    // second check they get is the difference being measured.
    const asked = scenarios.map((scenario) =>
      JSON.stringify([scenario.viewer.role, scenario.search]),
    );
    expect(new Set(asked).size).toBe(scenarios.length);
  });
});
