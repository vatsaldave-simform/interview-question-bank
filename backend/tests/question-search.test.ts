import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findVisibleQuestions,
  searchVisibleQuestions,
} from "../src/features/questions/questions.repository.js";
import type { Database } from "../src/platform/database.js";
import {
  commonestTags,
  inEveryBulkQuestion,
  inOneAnswerNoteOnly,
  seedTheBank,
  seedTheBulkBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.js";
import {
  createSqlLoggingDatabase,
  createTestDatabase,
  type SqlLoggingDatabase,
} from "./helpers/test-database.js";

const { aboutTypeScript, aboutTheClientsPipeline, aboutDisagreeing } = seededQuestionIds;

describe("searching the bank by keyword", () => {
  let database: Database;
  let reader: Viewer;
  let reviewer: Viewer;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
    reader = await viewerByRole(database, "reader");
    reviewer = await viewerByRole(database, "reviewer");
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  const search = (viewer: Viewer, keywords: string) =>
    searchVisibleQuestions(database, viewer, { keywords, tagsPerCategory: [], limit: 50, offset: 0 });

  it("finds a Question by a word that appears only in its Answer Notes", async () => {
    const found = await search(reader, inOneAnswerNoteOnly);

    expect(found.map((question) => question.id)).toEqual([aboutTypeScript]);
    expect(found[0]!.text).not.toContain(inOneAnswerNoteOnly);
    expect(found[0]!.answerNotes).toContain(inOneAnswerNoteOnly);
  });

  it("answers with the Question's Tags, named rather than by id", async () => {
    const [found] = await search(reader, inOneAnswerNoteOnly);

    expect(found!.tags).toContainEqual({ category: "technology", tag: "typescript" });
    expect(found!.tags).toContainEqual({ category: "seniority", tag: "mid" });
  });

  it("keeps a Client-restricted Question from a Viewer holding no Grant", async () => {
    const seenByReader = await search(reader, "pipeline");
    const seenByReviewer = await search(reviewer, "pipeline");

    expect(seenByReader.map((question) => question.id)).toEqual([aboutTheClientsPipeline]);
    expect(seenByReviewer).toEqual([]);
  });

  it("keeps a Pending Question from a Reader and shows it to a Reviewer", async () => {
    const seenByReader = await search(reader, "disagreed");
    const seenByReviewer = await search(reviewer, "disagreed");

    expect(seenByReader).toEqual([]);
    expect(seenByReviewer.map((question) => question.id)).toEqual([aboutDisagreeing]);
  });

  it("answers input that the strict parser would refuse", async () => {
    // Operators, an unclosed bracket and an unclosed quote, which is what a person types
    // into a search box without meaning any of it as syntax.
    const typed = 'typescript & (interface "merging';

    const found = await search(reader, typed);

    expect(found.map((question) => question.id)).toEqual([aboutTypeScript]);
    // And the same input really is the kind that breaks strict parsing, so the test above
    // is not quietly passing on something harmless.
    await expect(
      database.$queryRaw`SELECT to_tsquery('english', ${typed})`,
    ).rejects.toThrow(/syntax error in tsquery/i);
  });

  it("finds nothing rather than everything when no Question holds the keyword", async () => {
    expect(await search(reader, "kubernetes")).toEqual([]);
  });
});

const bulk = { count: 600, seed: "a-test-of-keyword-search" };

describe("keyword search alongside a Category filter", () => {
  let sqlLog: SqlLoggingDatabase;
  let database: Database;
  let reader: Viewer;
  let technology: string[];
  let seniority: string[];

  beforeAll(async () => {
    sqlLog = createSqlLoggingDatabase();
    database = sqlLog.database;
    await seedTheBulkBank(database, bulk);
    reader = await viewerByRole(database, "reader");
    technology = (await commonestTags(database, "technology", 2)).ids;
    seniority = (await commonestTags(database, "seniority", 1)).ids;
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  /** A whole answer rather than a page of one, so a test can compare sets. */
  const wholeAnswer = { limit: bulk.count * 2, offset: 0 };

  const idsOf = (questions: { id: string }[]): string[] => questions.map(({ id }) => id);

  it("returns the Questions the keyword and the Categories both match", async () => {
    const tagsPerCategory = [
      { category: "technology" as const, tagIds: technology },
      { category: "seniority" as const, tagIds: seniority },
    ];

    const both = await searchVisibleQuestions(database, reader, {
      keywords: inEveryBulkQuestion,
      tagsPerCategory,
      ...wholeAnswer,
    });

    // The intersection of the two answers, each of which is what the keyword alone and
    // the filter alone already return.
    const keywordOnly = new Set(
      idsOf(
        await searchVisibleQuestions(database, reader, {
          keywords: inEveryBulkQuestion,
          tagsPerCategory: [],
          ...wholeAnswer,
        }),
      ),
    );
    const filterOnly = idsOf(
      await findVisibleQuestions(database, reader, { tagsPerCategory, ...wholeAnswer }),
    );
    const intersection = filterOnly.filter((id) => keywordOnly.has(id));

    expect(intersection.length).toBeGreaterThan(0);
    expect(intersection.length).toBeLessThan(keywordOnly.size);
    expect(idsOf(both).sort()).toEqual(intersection.sort());
  });

  it("orders by relevance, with the Question id settling a tie", async () => {
    const keywords = `${inEveryBulkQuestion} trade-off`;
    const pageSize = 40;

    const found = await searchVisibleQuestions(database, reader, {
      keywords,
      tagsPerCategory: [],
      limit: pageSize,
      offset: 0,
    });

    // The ranks come from a second statement, and the whole answer is ranked here rather
    // than only the page. So this catches a page cut in the wrong order as well as a page
    // handed back in one — an order taken from createdAt fails either way.
    const everyMatch = await database.$queryRaw<{ id: string; rank: number }[]>`
      SELECT q.id, ts_rank(q."searchVector", search.query) AS rank
        FROM questions q, websearch_to_tsquery('english', ${keywords}) AS search(query)
       WHERE q."searchVector" @@ search.query
         AND (q."clientId" IS NULL
              OR EXISTS (SELECT 1 FROM permission_grants g
                          WHERE g."clientId" = q."clientId" AND g."viewerId" = ${reader.id}::uuid))
         AND (q."publicationState" = 'published' OR q."authorId" = ${reader.id}::uuid)
    `;
    const topByRank = everyMatch
      .sort(
        (one, other) =>
          Number(other.rank) - Number(one.rank) ||
          (one.id < other.id ? 1 : one.id > other.id ? -1 : 0),
      )
      .slice(0, pageSize)
      .map((row) => row.id);

    expect(everyMatch.length).toBeGreaterThan(pageSize);
    expect(idsOf(found)).toEqual(topByRank);
  });

  it("pages without repeating a Question or skipping one", async () => {
    const query = { keywords: inEveryBulkQuestion, tagsPerCategory: [] };

    const firstPage = await searchVisibleQuestions(database, reader, {
      ...query,
      limit: 20,
      offset: 0,
    });
    const secondPage = await searchVisibleQuestions(database, reader, {
      ...query,
      limit: 20,
      offset: 20,
    });
    const both = await searchVisibleQuestions(database, reader, {
      ...query,
      limit: 40,
      offset: 0,
    });

    expect(idsOf(firstPage).concat(idsOf(secondPage))).toEqual(idsOf(both));
  });

  it("asks PostgreSQL once, however many Categories the filter names", async () => {
    sqlLog.statements.length = 0;

    await searchVisibleQuestions(database, reader, {
      keywords: inEveryBulkQuestion,
      tagsPerCategory: [
        { category: "technology", tagIds: technology },
        { category: "seniority", tagIds: seniority },
      ],
      limit: 50,
      offset: 0,
    });

    // One, because the Tags of the page come back with it. A version that read the page
    // and then loaded its Tags would show more, and a version that filtered in JavaScript
    // would show one without these conditions in it.
    expect(sqlLog.statements).toHaveLength(1);
    const [statement] = sqlLog.statements;
    expect(statement).toContain("websearch_to_tsquery");
    expect(statement).toContain("permission_grants");
    expect(statement!.match(/EXISTS \(SELECT 1 FROM question_tags/g)).toHaveLength(2);
  });
});
