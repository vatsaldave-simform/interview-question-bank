import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { postReviewAct, resetTheQuestions, seedTheBank, seededQuestionIds } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const { aboutDisagreeing: pending, aboutTwoPlusTwo: rejected } = seededQuestionIds;

const returnBody = { reason: "Say what a strong answer covers, not only a weak one." };

/** Who has upvoted the Question, read straight from the table, since no route reads it yet. */
async function upvotersOf(database: Database, questionId: string): Promise<string[]> {
  const rows = await database.$queryRaw<{ viewerId: string }[]>`
    SELECT "viewerId" FROM upvotes WHERE "questionId" = ${questionId}::uuid ORDER BY "viewerId"
  `;
  return rows.map((row) => row.viewerId);
}

async function authorOf(database: Database, questionId: string): Promise<string> {
  const [row] = await database.$queryRaw<{ authorId: string }[]>`
    SELECT "authorId" FROM questions WHERE id = ${questionId}::uuid
  `;
  if (row === undefined) throw new Error(`No Question has the id ${questionId}.`);
  return row.authorId;
}

/** Taken back by hand, since the route that does it comes later. */
async function takeBack(database: Database, questionId: string, viewerId: string): Promise<void> {
  await database.$executeRaw`
    DELETE FROM upvotes WHERE "questionId" = ${questionId}::uuid AND "viewerId" = ${viewerId}::uuid
  `;
}

/** Publishing gives the Author's Upvote for them, unless they hold one already (ADR-0053). */
describe("Publishing gives the Author's Upvote", () => {
  let api: TestApi;
  let authorToken: string;
  let reviewerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** Returned, then resubmitted by its Author, so it is Pending and ready to Publish again. */
  async function returnAndResubmit(questionId: string): Promise<void> {
    expect((await postReviewAct(api, questionId, "return", reviewerToken, returnBody)).status).toBe(200);
    expect((await postReviewAct(api, questionId, "resubmit", authorToken)).status).toBe(200);
  }

  it("gives the Author one Upvote, and the Reviewer who Published none", async () => {
    expect((await postReviewAct(api, pending, "publish", reviewerToken)).status).toBe(200);

    expect(await upvotersOf(api.database, pending)).toEqual([await authorOf(api.database, pending)]);
  });

  it("gives nothing for Rejecting or resubmitting", async () => {
    expect((await postReviewAct(api, pending, "reject", reviewerToken, returnBody)).status).toBe(200);
    expect((await postReviewAct(api, rejected, "resubmit", authorToken)).status).toBe(200);

    expect(await upvotersOf(api.database, pending)).toEqual([]);
    expect(await upvotersOf(api.database, rejected)).toEqual([]);
  });

  it("gives it back when a returned Question is Published again, even if the Author took it back", async () => {
    await postReviewAct(api, pending, "publish", reviewerToken);
    const author = await authorOf(api.database, pending);
    await returnAndResubmit(pending);
    await takeBack(api.database, pending, author);

    expect((await postReviewAct(api, pending, "publish", reviewerToken)).status).toBe(200);

    expect(await upvotersOf(api.database, pending)).toEqual([author]);
  });

  it("adds no second one when the Author still holds theirs", async () => {
    await postReviewAct(api, pending, "publish", reviewerToken);
    await returnAndResubmit(pending);

    expect((await postReviewAct(api, pending, "publish", reviewerToken)).status).toBe(200);

    expect(await upvotersOf(api.database, pending)).toEqual([await authorOf(api.database, pending)]);
  });

  it("keeps the Upvotes a Question has when it is returned", async () => {
    await postReviewAct(api, pending, "publish", reviewerToken);

    await postReviewAct(api, pending, "return", reviewerToken, returnBody);

    expect(await upvotersOf(api.database, pending)).toEqual([await authorOf(api.database, pending)]);
  });
});
