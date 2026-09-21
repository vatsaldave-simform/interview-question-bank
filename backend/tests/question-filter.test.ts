import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findVisibleQuestions,
  type QuestionQuery,
} from "../src/features/questions/questions.repository.js";
import type { Database } from "../src/platform/database.js";
import {
  commonestTagIds,
  sameAnswerInJavaScript,
  seedTheBulkBank,
  viewerByRole,
} from "./helpers/question-bank.js";
import { createSqlLoggingDatabase, type SqlLoggingDatabase } from "./helpers/test-database.js";

const bulk = { count: 600, seed: "a-test-of-the-combined-filter" };

describe("filtering the bank by Category", () => {
  let sqlLog: SqlLoggingDatabase;
  let database: Database;
  let reader: Viewer;
  let reviewer: Viewer;
  let technology: string[];
  let seniority: string[];

  beforeAll(async () => {
    sqlLog = createSqlLoggingDatabase();
    database = sqlLog.database;
    await seedTheBulkBank(database, bulk);
    reader = await viewerByRole(database, "reader");
    reviewer = await viewerByRole(database, "reviewer");
    technology = await commonestTagIds(database, "technology", 2);
    seniority = await commonestTagIds(database, "seniority", 1);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  /** A whole answer rather than a page of one, so a test can compare sets. */
  function queryForEveryMatch(tagsPerCategory: QuestionQuery["tagsPerCategory"]): QuestionQuery {
    return { tagsPerCategory, limit: bulk.count, offset: 0 };
  }

  it("returns Questions carrying any of several Tags within one Category", async () => {
    const both = queryForEveryMatch([{ category: "technology", tagIds: technology }]);
    const first = queryForEveryMatch([{ category: "technology", tagIds: [technology[0]!] }]);
    const second = queryForEveryMatch([{ category: "technology", tagIds: [technology[1]!] }]);

    const matched = await findVisibleQuestions(database, reader, both);

    expect(matched.map((question) => question.id)).toEqual(
      await sameAnswerInJavaScript(database, reader, both.tagsPerCategory),
    );
    const firstOnly = await findVisibleQuestions(database, reader, first);
    const secondOnly = await findVisibleQuestions(database, reader, second);
    expect(firstOnly.length).toBeGreaterThan(0);
    expect(secondOnly.length).toBeGreaterThan(0);
    expect(matched.length).toBeGreaterThan(Math.max(firstOnly.length, secondOnly.length));
  });

  it("returns only Questions carrying a Tag from each of several Categories", async () => {
    const one = queryForEveryMatch([{ category: "technology", tagIds: technology }]);
    const two = queryForEveryMatch([
      { category: "technology", tagIds: technology },
      { category: "seniority", tagIds: seniority },
    ]);

    const matched = await findVisibleQuestions(database, reader, two);

    expect(matched.map((question) => question.id)).toEqual(
      await sameAnswerInJavaScript(database, reader, two.tagsPerCategory),
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan((await findVisibleQuestions(database, reader, one)).length);
    for (const question of matched) {
      expect(question.tags.some((tag) => tag.category === "technology")).toBe(true);
      expect(question.tags.some((tag) => tag.category === "seniority")).toBe(true);
    }
  });

  it("keeps a Client-restricted Question out of a page for a Viewer holding no Grant", async () => {
    const query = queryForEveryMatch([{ category: "technology", tagIds: technology }]);

    const seenByReviewer = await findVisibleQuestions(database, reviewer, query);
    const seenByReader = await findVisibleQuestions(database, reader, query);

    expect(seenByReviewer.every((question) => question.clientId === null)).toBe(true);
    expect(seenByReader.some((question) => question.clientId !== null)).toBe(true);
  });

  it("filters in one statement carrying one EXISTS per Category", async () => {
    sqlLog.statements.length = 0;

    await findVisibleQuestions(
      database,
      reader,
      queryForEveryMatch([
        { category: "technology", tagIds: technology },
        { category: "seniority", tagIds: seniority },
      ]),
    );

    // The page, then its rows' Tags and their Categories, each looked up by id. Only
    // the first carries a condition: a version that collected ids and paged them in a
    // second pass would show a second one, and that is the version this rules out.
    expect(sqlLog.statements).toHaveLength(4);
    const [page, ...loadingTags] = sqlLog.statements;
    expect(loadingTags.every((sql) => !sql.includes("EXISTS"))).toBe(true);
    expect(page).toContain("LIMIT");
    expect(page).toContain("permission_grants");
    expect(page!.match(/EXISTS\(SELECT[^)]*"question_tags"/g)).toHaveLength(2);
    // Both columns, because the id is what settles a createdAt tie between pages.
    expect(page).toMatch(/ORDER BY[^;]*"createdAt" DESC, [^;]*"id" DESC/);
  });
});
