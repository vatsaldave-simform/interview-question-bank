import { questionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/features/auth/password.js";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  getQuestions,
  inBothClientsQuestions,
  inNoQuestionAtAll,
  inTheOtherClientsQuestionsOnly,
  seedTheBank,
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

    expect(await statusAndBody(restricted)).toBe(await statusAndBody(nothing));
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

    expect(await statusAndBody(both)).toBe(await statusAndBody(nothing));
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
