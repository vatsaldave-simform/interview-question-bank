import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findVisibleQuestions,
  type QuestionQuery,
} from "../src/features/questions/questions.repository.js";
import type { Database } from "../src/platform/database.js";
import {
  commonestTags,
  sameAnswerInJavaScript,
  seedTheBulkBank,
  viewerByRole,
} from "./helpers/question-bank.js";
import { createTestDatabase } from "./helpers/test-database.js";

/** Bigger than the other suites need: the filter has to leave enough Questions behind
 * for two of them to share a createdAt, which is the boundary worth paging across. */
const bulk = { count: 2500, seed: "a-test-of-pagination" };
const pageSize = 25;

describe("paging through a filtered bank", () => {
  let database: Database;
  let reader: Viewer;
  let tagsPerCategory: QuestionQuery["tagsPerCategory"];

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBulkBank(database, bulk);
    reader = await viewerByRole(database, "reader");
    tagsPerCategory = [
      { category: "technology", tagIds: (await commonestTags(database, "technology", 2)).ids },
    ];
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  /** Every page in turn, in the order a caller would ask for them. */
  async function everyPage(limit: number): Promise<string[]> {
    const ids: string[] = [];
    for (let offset = 0; ; offset += limit) {
      const page = await findVisibleQuestions(database, reader, { tagsPerCategory, limit, offset });
      ids.push(...page.map((question) => question.id));
      if (page.length < limit) return ids;
    }
  }

  function everyMatch(): Promise<{ id: string; createdAt: Date }[]> {
    return findVisibleQuestions(database, reader, { tagsPerCategory, limit: bulk.count, offset: 0 });
  }

  it("has Questions sharing a createdAt, which is what the id tiebreaker is for", async () => {
    const times = (await everyMatch()).map((question) => question.createdAt.getTime());

    expect(new Set(times).size).toBeLessThan(times.length);
  });

  it("drops no Question and repeats none across every page boundary", async () => {
    const expected = await sameAnswerInJavaScript(database, reader, tagsPerCategory);

    const walked = await everyPage(pageSize);

    expect(walked.length).toBeGreaterThan(pageSize);
    expect(new Set(walked).size).toBe(walked.length);
    // Against an answer worked out elsewhere, so this holds the walk to the order the
    // contract promises rather than to whatever order the query happened to return.
    expect(walked).toEqual(expected);
  });

  it("splits a run of Questions sharing a createdAt across two pages without losing one", async () => {
    const all = await everyMatch();
    // A boundary inside a run of equal createdAt is the case the id tiebreaker exists
    // for; without one the two pages could overlap or skip.
    const insideATie = all.findIndex(
      (question, at) =>
        at > 0 && question.createdAt.getTime() === all[at - 1]!.createdAt.getTime(),
    );
    expect(insideATie).toBeGreaterThan(0);

    const before = await findVisibleQuestions(database, reader, {
      tagsPerCategory,
      limit: insideATie,
      offset: 0,
    });
    const after = await findVisibleQuestions(database, reader, {
      tagsPerCategory,
      limit: pageSize,
      offset: insideATie,
    });

    const expected = await sameAnswerInJavaScript(database, reader, tagsPerCategory);
    expect([...before, ...after].map((question) => question.id)).toEqual(
      expected.slice(0, insideATie + pageSize),
    );
  });

  it("returns the whole bank the Viewer may see when no Category is named", async () => {
    const unfiltered = await findVisibleQuestions(database, reader, {
      tagsPerCategory: [],
      limit: bulk.count + 10,
      offset: 0,
    });

    expect(unfiltered.map((question) => question.id)).toEqual(
      await sameAnswerInJavaScript(database, reader, []),
    );
    expect(unfiltered.length).toBeGreaterThan((await everyMatch()).length);
  });
});
