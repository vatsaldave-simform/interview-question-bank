import { questionListResponseSchema, type QuestionListResponse } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/features/auth/password.js";
import { seedClient } from "../src/features/clients/clients.seed.js";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  clientIdNamed,
  getQuestions,
  inBothClientsQuestions,
  inEveryBulkQuestion,
  inNoQuestionAtAll,
  inTheOtherClientsQuestionsOnly,
  seedTheBank,
  seedTheBulkBank,
  seededQuestionIds,
  tagOnNoQuestionAtAll,
  tagOnTheOtherClientsQuestionsOnly,
} from "./helpers/question-bank.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

/**
 * A Viewer holding no Permission Grant at all. Every seeded Viewer holds one for one
 * Client or the other, and holding none is its own case. The row is written here because
 * creating a Viewer over HTTP is #25.
 */
async function logInHoldingNoGrant(api: TestApi): Promise<string> {
  const credentials = {
    email: "no-grants@iqb.test",
    password: "no-grants-password",
    role: "reader" as const,
  };
  await api.database.viewer.create({
    data: {
      email: credentials.email,
      role: credentials.role,
      passwordHash: await hashPassword(credentials.password),
    },
  });
  return logIn(api, credentials);
}

/**
 * The guarantee the whole project is built around: a Question restricted to a Client a
 * Viewer holds no Grant for answers exactly as a Question that is not there. Asserted
 * over HTTP, because that is the only place "cannot be told apart" means anything — a
 * caller has the status and the bytes and nothing else.
 */
describe("a restricted Question and a Question that is not there", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client and none for the second. */
  let readerToken: string;
  /** The other way round: a Grant for the second Client and none for the first. */
  let reviewerToken: string;
  let noGrantToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    noGrantToken = await logInHoldingNoGrant(api);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** Everything a caller gets to look at, in one string a test can compare. */
  async function statusAndBody(response: Response): Promise<string> {
    return `${response.status} ${await response.text()}`;
  }

  it("answers a keyword matching only another Client's Questions as one matching nothing", async () => {
    const restricted = await getQuestions(
      api,
      { keywords: inTheOtherClientsQuestionsOnly },
      readerToken,
    );
    const nothing = await getQuestions(api, { keywords: inNoQuestionAtAll }, readerToken);
    // The Viewer who holds the Grant gets something else, so "the same" is a constraint
    // here and not two empty pages that were always going to match.
    const holder = await getQuestions(
      api,
      { keywords: inTheOtherClientsQuestionsOnly },
      reviewerToken,
    );

    const zeroMatch = await statusAndBody(nothing);
    expect(await statusAndBody(restricted)).toBe(zeroMatch);
    expect(await statusAndBody(holder)).not.toBe(zeroMatch);
  });

  it("answers a Viewer holding no Grant at all in exactly the same way", async () => {
    const restricted = await getQuestions(
      api,
      { keywords: inTheOtherClientsQuestionsOnly },
      noGrantToken,
    );
    const nothing = await getQuestions(api, { keywords: inNoQuestionAtAll }, noGrantToken);
    const holder = await getQuestions(
      api,
      { keywords: inTheOtherClientsQuestionsOnly },
      reviewerToken,
    );

    const zeroMatch = await statusAndBody(nothing);
    expect(await statusAndBody(restricted)).toBe(zeroMatch);
    expect(await statusAndBody(holder)).not.toBe(zeroMatch);
  });

  it("finds that same keyword's Question for the Viewer who does hold the Grant", async () => {
    const found = await getQuestions(
      api,
      { keywords: inTheOtherClientsQuestionsOnly },
      reviewerToken,
    );

    const body = questionListResponseSchema.parse(await found.json());
    expect(body.questions.map((question) => question.id)).toEqual([
      seededQuestionIds.aboutTheOtherClientsBooking,
    ]);
  });

  it("hands each Viewer only their own Client's Question when a term matches both", async () => {
    const forReader = await getQuestions(api, { keywords: inBothClientsQuestions }, readerToken);
    const forReviewer = await getQuestions(
      api,
      { keywords: inBothClientsQuestions },
      reviewerToken,
    );

    const seenByReader = questionListResponseSchema.parse(await forReader.json());
    const seenByReviewer = questionListResponseSchema.parse(await forReviewer.json());
    expect(seenByReader.questions.map((question) => question.id)).toEqual([
      seededQuestionIds.aboutTheClientsPipeline,
    ]);
    expect(seenByReviewer.questions.map((question) => question.id)).toEqual([
      seededQuestionIds.aboutTheOtherClientsBooking,
    ]);
  });

  it("answers a Viewer holding no Grant nothing for that same term", async () => {
    const both = await getQuestions(api, { keywords: inBothClientsQuestions }, noGrantToken);
    const nothing = await getQuestions(api, { keywords: inNoQuestionAtAll }, noGrantToken);
    const holder = await getQuestions(api, { keywords: inBothClientsQuestions }, readerToken);

    const zeroMatch = await statusAndBody(nothing);
    expect(await statusAndBody(both)).toBe(zeroMatch);
    expect(await statusAndBody(holder)).not.toBe(zeroMatch);
  });

  it("answers a Category filter matching only another Client's Questions as one matching nothing", async () => {
    const restricted = await getQuestions(
      api,
      { technology: tagOnTheOtherClientsQuestionsOnly.tag },
      readerToken,
    );
    const nothing = await getQuestions(
      api,
      { technology: tagOnNoQuestionAtAll.tag },
      readerToken,
    );
    // The same guard as for the keyword: both Tags exist, and only one of them is
    // carried, so the two empty pages are not empty for the same reason.
    const holder = await getQuestions(
      api,
      { technology: tagOnTheOtherClientsQuestionsOnly.tag },
      reviewerToken,
    );

    const zeroMatch = await statusAndBody(nothing);
    expect(await statusAndBody(restricted)).toBe(zeroMatch);
    expect(await statusAndBody(holder)).not.toBe(zeroMatch);
  });

  it("answers that same filter with both Questions for the Viewer holding the Grant", async () => {
    const found = await getQuestions(
      api,
      { technology: tagOnTheOtherClientsQuestionsOnly.tag },
      reviewerToken,
    );

    const body = questionListResponseSchema.parse(await found.json());
    expect(body.questions.map((question) => question.id).sort()).toEqual(
      [
        seededQuestionIds.aboutTheOtherClientsBooking,
        seededQuestionIds.aboutTheOtherClientsIntake,
      ].sort(),
    );
  });
});

const bulk = { count: 600, seed: "a-test-of-what-a-response-leaves-out" };

/**
 * The other half of the guarantee. The excluded Question is missing from the page, and
 * nothing else in the response says it was ever there: not the page metadata, not the
 * number of rows the page came back with, and not a second statement that read it and
 * dropped it. A bulk bank, because "the page is still full" needs a full page.
 */
describe("what a response says about the Questions it left out", () => {
  let api: TestApi;
  let readerToken: string;
  let reviewerToken: string;
  /** The Client the bulk bank restricts to; the Reviewer holds no Grant for it. */
  let restrictedTo: string;

  beforeAll(async () => {
    api = await startTestApi({ recordSql: true });
    await seedTheBulkBank(api.database, bulk);
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    restrictedTo = await clientIdNamed(api.database, seedClient.name);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** What the API sent to the database while doing one thing. */
  async function statementsDuring(request: () => Promise<Response>): Promise<string[]> {
    const before = api.statements().length;
    await request();
    return api.statements().slice(before);
  }

  async function pageOf(
    params: Record<string, string | number>,
    token: string,
  ): Promise<QuestionListResponse> {
    const response = await getQuestions(api, params, token);
    return questionListResponseSchema.parse(await response.json());
  }

  const idsOf = (page: QuestionListResponse): string[] =>
    page.questions.map((question) => question.id);

  it("carries the page it was asked for and no count of anything", async () => {
    const asked = { keywords: inEveryBulkQuestion, limit: 20, offset: 40 };

    const bodies = await Promise.all(
      [reviewerToken, readerToken].map(
        async (token) =>
          (await (await getQuestions(api, asked, token)).json()) as Record<string, unknown>,
      ),
    );

    for (const body of bodies) {
      // Exactly these three. A total, a number of matches or a "some were hidden" flag
      // would each differ between these two Viewers and say what was left out.
      expect(Object.keys(body).sort()).toEqual(["limit", "offset", "questions"]);
      const page = questionListResponseSchema.parse(body);
      expect(page.limit).toBe(asked.limit);
      expect(page.offset).toBe(asked.offset);
    }
    // The two did read different banks, so matching metadata is a constraint here and
    // not two identical requests agreeing with each other.
    expect(bodies[0]!.questions).not.toEqual(bodies[1]!.questions);
  });

  it("hands a Viewer holding no Grant full pages, so an excluded Question takes no slot", async () => {
    const query = { keywords: inEveryBulkQuestion, limit: 25 };

    const first = await pageOf({ ...query, offset: 0 }, reviewerToken);
    const second = await pageOf({ ...query, offset: 25 }, reviewerToken);
    const both = await pageOf({ ...query, limit: 50, offset: 0 }, reviewerToken);

    // Full, rather than 25 less however many the Viewer may not have. A read that
    // fetched a page and then dropped the restricted rows would come back short.
    expect(first.questions).toHaveLength(25);
    expect(second.questions).toHaveLength(25);
    expect([...idsOf(first), ...idsOf(second)]).toEqual(idsOf(both));
    expect(both.questions.every((question) => question.clientId !== restrictedTo)).toBe(true);
    // And the same request really did have Questions to leave out: the Reader holds the
    // Grant and their page carries them.
    const forReader = await pageOf({ ...query, offset: 0 }, readerToken);
    expect(forReader.questions.some((question) => question.clientId === restrictedTo)).toBe(true);
  });

  it("reads the questions table once per request, and that read names the Permission Grants", async () => {
    const hidden = await api.database.question.findFirstOrThrow({
      where: { clientId: restrictedTo },
      select: { id: true },
    });

    const searched = await statementsDuring(() =>
      getQuestions(api, { keywords: inEveryBulkQuestion, limit: 25 }, reviewerToken),
    );
    const filtered = await statementsDuring(() =>
      getQuestions(api, { technology: "typescript", limit: 25 }, reviewerToken),
    );
    // The single fetch is a third way to the questions table, and "no code path" means
    // this one too.
    const fetched = await statementsDuring(() =>
      api.request(`/api/questions/${hidden.id}`, {
        headers: { authorization: `Bearer ${reviewerToken}` },
      }),
    );

    for (const asked of [searched, filtered, fetched]) {
      // One statement reads Questions and it is the one carrying the check. A second
      // one is what fetching restricted rows and discarding them would look like.
      const readingQuestions = asked.filter((sql) => /\bquestions\b/.test(sql));
      expect(readingQuestions).toHaveLength(1);
      expect(readingQuestions[0]).toContain("permission_grants");
    }
    // The page is cut in that same statement, so the check runs before the rows are
    // counted out rather than on whatever came back.
    for (const asked of [searched, filtered]) {
      expect(asked.find((sql) => /\bquestions\b/.test(sql))).toMatch(/LIMIT/i);
    }
  });
});
