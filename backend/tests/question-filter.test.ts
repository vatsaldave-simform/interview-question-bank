import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import {
  findVisibleQuestions,
  type QuestionQuery,
} from "../src/features/questions/questions.repository.ts";
import type { Database } from "../src/platform/database.ts";
import {
  aViewer,
  clientIdNamed,
  commonestTags,
  sameAnswerInJavaScript,
  seedTheBulkBank,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { createSqlLoggingDatabase, type SqlLoggingDatabase } from "./helpers/test-database.ts";

const bulk = { count: 600, seed: "a-test-of-the-combined-filter" };

describe("filtering the bank by Category", () => {
  let sqlLog: SqlLoggingDatabase;
  let database: Database;
  let author: Viewer;
  let reviewer: Viewer;
  let technology: string[];
  let seniority: string[];

  beforeAll(async () => {
    sqlLog = createSqlLoggingDatabase();
    database = sqlLog.database;
    await seedTheBulkBank(database, bulk);
    author = await viewerByRole(database, "author");
    reviewer = await viewerByRole(database, "reviewer");
    technology = (await commonestTags(database, "technology", 2)).ids;
    seniority = (await commonestTags(database, "seniority", 1)).ids;
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

    const matched = await findVisibleQuestions(database, author, both);

    expect(matched.map((question) => question.id)).toEqual(
      await sameAnswerInJavaScript(database, author, both.tagsPerCategory),
    );
    const firstOnly = await findVisibleQuestions(database, author, first);
    const secondOnly = await findVisibleQuestions(database, author, second);
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

    const matched = await findVisibleQuestions(database, author, two);

    expect(matched.map((question) => question.id)).toEqual(
      await sameAnswerInJavaScript(database, author, two.tagsPerCategory),
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan((await findVisibleQuestions(database, author, one)).length);
    for (const question of matched) {
      expect(question.tags.some((tag) => tag.category === "technology")).toBe(true);
      expect(question.tags.some((tag) => tag.category === "seniority")).toBe(true);
    }
  });

  it("puts a Question that names a Client in every Viewer's page", async () => {
    const query = queryForEveryMatch([{ category: "technology", tagIds: technology }]);
    // The bulk bank names this Client.
    const named = await clientIdNamed(database, seedClient.name);

    const seenByReviewer = await findVisibleQuestions(database, reviewer, query);
    // A fresh Author, since the seeded one also sees the Pending Questions they added.
    const newcomer = await aViewer(database, "author");
    const seenByNewcomer = await findVisibleQuestions(database, newcomer, query);

    expect(seenByReviewer.some(({ clients }) => clients.some(({ id }) => id === named))).toBe(true);
    // The whole bank is Published, so the two pages are the same page.
    expect(seenByReviewer.map(({ id }) => id)).toEqual(seenByNewcomer.map(({ id }) => id));
  });

  it("filters in one statement carrying one EXISTS per Category", async () => {
    sqlLog.statements.length = 0;

    await findVisibleQuestions(
      database,
      author,
      queryForEveryMatch([
        { category: "technology", tagIds: technology },
        { category: "seniority", tagIds: seniority },
      ]),
    );

    // One, because the Tags of the page come back with it. A version that collected ids
    // and paged them in a second pass would show more, and a version that filtered in
    // JavaScript would show one without these conditions in it.
    expect(sqlLog.statements).toHaveLength(1);
    const [page] = sqlLog.statements;
    expect(page).toContain("LIMIT");
    expect(page).toContain(`q."publicationState" = 'published'`);
    expect(page!.match(/EXISTS \(SELECT 1 FROM question_tags/g)).toHaveLength(2);
    // Both columns, because the id is what settles a createdAt tie between pages.
    expect(page).toMatch(/ORDER BY q\."createdAt" DESC, q\.id DESC/);
  });
});
