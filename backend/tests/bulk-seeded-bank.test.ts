import { categoryNames, publicationStates, type CategoryName } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bulkTagPrefix,
  seedBulkBank,
  type BulkBankOptions,
} from "../src/features/questions/bulk-bank.seed.js";
import { seedQuestions } from "../src/features/questions/questions.seed.js";
import type { Database } from "../src/platform/database.js";
import { seedTheBank } from "./helpers/question-bank.js";
import { createTestDatabase } from "./helpers/test-database.js";

/** Far smaller than a bank worth timing, and big enough to still have a spread. */
const bulk: BulkBankOptions = { count: 600, seed: "a-test-of-the-bulk-bank" };

/** The small seed writes a handful of Questions of its own, which would answer several
 * of the assertions below on their own, so every one of them asks about these rows only. */
const fromTheBulkBank = { id: { notIn: seedQuestions.map((question) => question.id) } };

type BankRow = {
  id: string;
  createdAt: Date;
  restricted: boolean;
  tags: string[];
};

/** Everything a second run has to write again. Tag values rather than Tag ids, and
 * whether a Question is restricted rather than which Client it names: the database
 * writes those ids, and they differ between two empty databases. */
async function bulkBankRows(database: Database): Promise<BankRow[]> {
  const questions = await database.question.findMany({
    where: fromTheBulkBank,
    orderBy: { id: "asc" },
    select: {
      id: true,
      text: true,
      createdAt: true,
      publicationState: true,
      provenance: true,
      clientId: true,
      tags: { select: { tag: { select: { value: true } } } },
    },
  });
  return questions.map(({ clientId, tags, ...question }) => ({
    ...question,
    restricted: clientId !== null,
    tags: tags.map(({ tag }) => tag.value).sort(),
  }));
}

/** How many of the bulk bank's Questions carry each Tag of one Category, commonest
 * first. A Tag no Question carries is absent rather than zero. */
async function tagPopularity(database: Database, category: CategoryName): Promise<number[]> {
  const carried = await database.questionTag.groupBy({
    by: ["tagId"],
    where: { question: fromTheBulkBank, tag: { category: { name: category } } },
    _count: { _all: true },
  });
  return carried.map((tag) => tag._count._all).sort((one, other) => other - one);
}

describe("the bulk bank", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
    await seedBulkBank(database, bulk);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("writes the number of Questions it was asked for, beside the seeded ones", async () => {
    expect(await database.question.count({ where: fromTheBulkBank })).toBe(bulk.count);
    expect(await database.question.count()).toBe(bulk.count + seedQuestions.length);
  });

  it("puts Tags from every Category on the bank", async () => {
    const carried = await database.questionTag.findMany({
      where: { question: fromTheBulkBank },
      select: { tag: { select: { category: { select: { name: true } } } } },
    });

    const categoriesCarried = new Set(carried.map(({ tag }) => tag.category.name));
    expect([...categoriesCarried].sort()).toEqual([...categoryNames].sort());
  });

  it("adds its own Tag values and adds no Category", async () => {
    const categories = await database.category.findMany({ select: { name: true } });
    const added = await database.tag.count({ where: { value: { startsWith: bulkTagPrefix } } });

    expect(categories.map((category) => category.name).sort()).toEqual([...categoryNames].sort());
    expect(added).toBeGreaterThan(0);
  });

  it("restricts roughly a fifth to a Client and leaves the rest unrestricted", async () => {
    const restricted = await database.question.count({
      where: { AND: [fromTheBulkBank, { clientId: { not: null } }] },
    });
    const unrestricted = await database.question.count({
      where: { AND: [fromTheBulkBank, { clientId: null }] },
    });

    expect(restricted).toBeGreaterThan(bulk.count * 0.1);
    expect(restricted).toBeLessThan(bulk.count * 0.3);
    expect(unrestricted).toBe(bulk.count - restricted);
  });

  it("writes Questions in every Publication State", async () => {
    const states = await database.question.groupBy({
      by: ["publicationState"],
      where: fromTheBulkBank,
      _count: { _all: true },
    });

    expect(states.map((state) => state.publicationState).sort()).toEqual(
      [...publicationStates].sort(),
    );
    for (const state of states) expect(state._count._all).toBeGreaterThan(1);
  });

  it("makes some Tags of a Category far more common than others", async () => {
    const popularity = await tagPopularity(database, "technology");

    const commonest = popularity[0]!;
    const rarest = popularity[popularity.length - 1]!;
    expect(popularity.length).toBeGreaterThan(20);
    expect(commonest).toBeGreaterThan(rarest * 10);
  });

  it("gives two Questions the same createdAt, so the id tiebreaker has a tie to break", async () => {
    const ties = await database.question.groupBy({
      by: ["createdAt"],
      where: fromTheBulkBank,
      _count: { _all: true },
      having: { createdAt: { _count: { gt: 1 } } },
    });

    expect(ties.length).toBeGreaterThan(0);
  });
});

describe("seeding the bulk bank again", () => {
  let database: Database;

  /** An empty database, the small seed, then the bulk bank, as a run of the command
   * does it. */
  async function seedAfresh(options: BulkBankOptions = bulk): Promise<BankRow[]> {
    await seedTheBank(database);
    await seedBulkBank(database, options);
    return bulkBankRows(database);
  }

  beforeAll(async () => {
    database = createTestDatabase();
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("writes the same bank for the same seed value", async () => {
    const first = await seedAfresh();

    expect(await seedAfresh()).toEqual(first);
  });

  it("writes a different bank for a different seed value", async () => {
    const first = await seedAfresh();

    expect(await seedAfresh({ ...bulk, seed: "a different seed value" })).not.toEqual(first);
  });

  it("writes part of the bigger bank when asked for a smaller one", async () => {
    const smaller = await seedAfresh({ ...bulk, count: 300 });

    const bigger = await seedAfresh();

    const byId = new Map(bigger.map((question) => [question.id, question]));
    expect(smaller.length).toBe(300);
    expect(bigger.length).toBe(bulk.count);
    expect(smaller.map((question) => byId.get(question.id))).toEqual(smaller);
  });

  it("adds nothing when it runs twice over the same database", async () => {
    await seedAfresh();
    const before = await Promise.all([
      database.question.count(),
      database.questionTag.count(),
      database.tag.count(),
    ]);

    const summary = await seedBulkBank(database, bulk);

    expect([summary.questionsWritten, summary.tagsWritten]).toEqual([0, 0]);
    expect(
      await Promise.all([
        database.question.count(),
        database.questionTag.count(),
        database.tag.count(),
      ]),
    ).toEqual(before);
  });
});
