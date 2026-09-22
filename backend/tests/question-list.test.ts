import {
  apiErrorSchema,
  categoryNames,
  defaultQuestionPageSize,
  maxKeywordsLength,
  maxQuestionPageSize,
  questionListResponseSchema,
} from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.js";
import type { TagsInCategory } from "../src/features/questions/questions.repository.js";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  clientIdNamed,
  commonestTags,
  getQuestions,
  inMuchOfTheBulkBank,
  inOneAnswerNoteOnly,
  sameAnswerInJavaScript,
  seedTheBulkBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

const bulk = { count: 600, seed: "a-test-of-the-question-list" };


/**
 * The filter as a caller meets it: a URL. The query is already tested directly, so what
 * only exists here is the request and the response — which parameters are read, and
 * which requests are refused rather than quietly read as something else (ADR-0025).
 */
describe("listing Questions over HTTP", () => {
  let api: TestApi;
  let readerToken: string;
  let reviewerToken: string;
  let technology: { ids: string[]; values: string[] };
  let seniority: { ids: string[]; values: string[] };

  beforeAll(async () => {
    api = await startTestApi({ recordSql: true });
    await seedTheBulkBank(api.database, bulk);
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    technology = await commonestTags(api.database, "technology", 2);
    seniority = await commonestTags(api.database, "seniority", 1);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** What the query function would be handed for the same filter. */
  function asTagIds(): TagsInCategory[] {
    return [
      { category: "technology", tagIds: technology.ids },
      { category: "seniority", tagIds: seniority.ids },
    ];
  }

  function bothCategories(): Record<string, string[]> {
    return { technology: technology.values, seniority: seniority.values };
  }

  /** What the API sent to the database while doing one thing. */
  async function statementsDuring(request: () => Promise<Response>): Promise<string[]> {
    const before = api.statements().length;
    await request();
    return api.statements().slice(before);
  }

  it("returns the Questions matching Tags from several Categories at once", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const expected = await sameAnswerInJavaScript(api.database, reader, asTagIds());

    const response = await getQuestions(
      api,
      { ...bothCategories(), limit: maxQuestionPageSize },
      readerToken,
    );

    expect(response.status).toBe(200);
    const body = questionListResponseSchema.parse(await response.json());
    expect(expected.length).toBeGreaterThan(0);
    expect(body.questions.map((question) => question.id)).toEqual(
      expected.slice(0, maxQuestionPageSize),
    );
    for (const question of body.questions) {
      expect(question.tags.some((tag) => tag.category === "technology")).toBe(true);
      expect(question.tags.some((tag) => tag.category === "seniority")).toBe(true);
    }
  });

  it("drops no Question and repeats none across page boundaries", async () => {
    const reader = await viewerByRole(api.database, "reader");
    const expected = await sameAnswerInJavaScript(api.database, reader, [
      { category: "technology", tagIds: technology.ids },
    ]);
    const limit = 20;

    // Bounded, so an offset the API ignored ends the test instead of looping forever.
    const walked: string[] = [];
    for (let offset = 0; offset <= bulk.count; offset += limit) {
      const response = await getQuestions(
        api,
        { technology: technology.values, limit, offset },
        readerToken,
      );
      const page = questionListResponseSchema.parse(await response.json());
      walked.push(...page.questions.map((question) => question.id));
      if (page.questions.length < limit) break;
    }

    expect(walked.length).toBeGreaterThan(limit);
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked).toEqual(expected);
  });

  it("answers with a page of the default size when none is asked for", async () => {
    const response = await getQuestions(api, {}, readerToken);

    const body = questionListResponseSchema.parse(await response.json());
    expect(body.limit).toBe(defaultQuestionPageSize);
    expect(body.offset).toBe(0);
    expect(body.questions).toHaveLength(defaultQuestionPageSize);
  });

  it("refuses a Category nothing in the vocabulary names, without asking the database", async () => {
    let response!: Response;
    const asked = await statementsDuring(async () => {
      response = await getQuestions(api, { vibes: "good" }, readerToken);
      return response;
    });

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    // The Category list is closed in code, so this refusal needs no row to be read
    // (ADR-0024). The sign-in check did read one, which is what keeps the next line
    // from passing just because nothing ran at all.
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.some((sql) => sql.includes('"tags"') || sql.includes('"categories"'))).toBe(false);
  });

  it("refuses a Tag value no Tag in that Category holds, once the database has been asked", async () => {
    let response!: Response;
    const asked = await statementsDuring(async () => {
      response = await getQuestions(api, { technology: "cobol" }, readerToken);
      return response;
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(JSON.stringify(body.error.details)).toContain("cobol");
    // The other half of the asymmetry: a Tag value is a row, so only the database can
    // say it does not exist.
    expect(asked.some((sql) => sql.includes('"tags"'))).toBe(true);
  });

  it.each([
    ["a page larger than the cap", { limit: maxQuestionPageSize + 1 }],
    ["a page of nothing", { limit: 0 }],
    ["an offset before the start", { offset: -1 }],
    ["a limit that is not a number", { limit: "lots" }],
  ])("refuses %s rather than quietly reading it as something else", async (_case, params) => {
    const response = await getQuestions(api, params, readerToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("never puts a Client-restricted Question in a page for a Viewer holding no Grant", async () => {
    // The Reviewer holds no Grant for this Client, and does hold one for the other
    // seeded Client, so the check is "not this one" rather than "not restricted at all".
    const restrictedTo = await clientIdNamed(api.database, seedClient.name);

    const forReviewer = await getQuestions(api, { limit: maxQuestionPageSize }, reviewerToken);
    const forReader = await getQuestions(api, { limit: maxQuestionPageSize }, readerToken);

    const seenByReviewer = questionListResponseSchema.parse(await forReviewer.json());
    const seenByReader = questionListResponseSchema.parse(await forReader.json());
    // Non-empty first, or "no restricted Question here" would be true of nothing.
    expect(seenByReviewer.questions.length).toBeGreaterThan(0);
    expect(
      seenByReviewer.questions.every((question) => question.clientId !== restrictedTo),
    ).toBe(true);
    expect(seenByReader.questions.some((question) => question.clientId === restrictedTo)).toBe(
      true,
    );
  });

  it("returns the Questions a keyword and a Category filter both match", async () => {
    const filter = { technology: "typescript" };

    const searched = await getQuestions(api, { ...filter, keywords: inOneAnswerNoteOnly }, readerToken);

    const both = questionListResponseSchema.parse(await searched.json());
    expect(both.questions.map((question) => question.id)).toEqual([
      seededQuestionIds.aboutTypeScript,
    ]);

    // Each half of the request alone answers with more, so neither was read and dropped.
    const filterOnly = questionListResponseSchema.parse(
      await (await getQuestions(api, filter, readerToken)).json(),
    );
    const keywordOnly = questionListResponseSchema.parse(
      await (await getQuestions(api, { keywords: inMuchOfTheBulkBank }, readerToken)).json(),
    );
    expect(filterOnly.questions.length).toBeGreaterThan(both.questions.length);
    expect(keywordOnly.questions.length).toBeGreaterThan(both.questions.length);
  });

  it("refuses an unknown Tag even when the request also searches", async () => {
    const response = await getQuestions(
      api,
      { keywords: inMuchOfTheBulkBank, technology: "no-such-tag" },
      readerToken,
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.message).toContain("No such Tag");
  });

  it("refuses keywords longer than the cap rather than cutting them short", async () => {
    const tooLong = "a".repeat(maxKeywordsLength + 1);

    const response = await getQuestions(api, { keywords: tooLong }, readerToken);

    expect(response.status).toBe(400);
    // And the length just under it is answered, so the cap is where it says it is.
    const atTheCap = await getQuestions(api, { keywords: "a".repeat(maxKeywordsLength) }, readerToken);
    expect(atTheCap.status).toBe(200);
  });

  it("reads an empty keywords parameter as no keywords at all", async () => {
    const response = await getQuestions(api, { keywords: "  " }, readerToken);

    // The whole bank the Reader can see, newest first, rather than an empty page.
    const body = questionListResponseSchema.parse(await response.json());
    expect(body.questions.length).toBe(defaultQuestionPageSize);
  });

  it("carries the page it used back to a caller that searched", async () => {
    const response = await getQuestions(api, { keywords: inMuchOfTheBulkBank }, readerToken);

    const body = questionListResponseSchema.parse(await response.json());
    expect(body.limit).toBe(defaultQuestionPageSize);
    expect(body.offset).toBe(0);
  });

  // A Category is a query parameter, so a Category named `limit` would silently eat the
  // page size. Nothing stops someone adding one but this (ADR-0025).
  it("names no Category that a page parameter already uses", () => {
    expect(categoryNames).not.toContain("limit");
    expect(categoryNames).not.toContain("offset");
    expect(categoryNames).not.toContain("keywords");
  });
});
