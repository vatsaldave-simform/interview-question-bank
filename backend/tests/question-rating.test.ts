import { ratingResponseSchema, type RatingSummary } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  historyOf,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

const {
  aboutTypeScript: published,
  aboutDisagreeing: pending,
  aboutTwoPlusTwo: rejected,
  aboutTheClientsPipeline: publishedForTheFirstClient,
  aboutTheOtherClientsBooking: publishedForTheSecondClient,
} = seededQuestionIds;

/** Over HTTP, because "cannot be told apart" means the status and the bytes (ADR-0002). */
describe("rating a Question", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client and none for the second. */
  let readerToken: string;
  let authorToken: string;
  /** The other way round from the Reader. */
  let reviewerToken: string;
  let noGrantToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    noGrantToken = await logInHoldingNoGrant(api, "reader");
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  function rate(id: string, body: unknown, token: string): Promise<Response> {
    return api.request(`/api/questions/${id}/rating`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async function ratingAnswered(response: Response): Promise<RatingSummary> {
    if (response.status !== 200) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return ratingResponseSchema.parse(await response.json()).rating;
  }

  it("lets a Reader rate a Published Question, and the Question then carries it", async () => {
    const rating = await ratingAnswered(await rate(published, { value: 4 }, readerToken));

    expect(rating).toEqual({ average: 4, count: 1, mine: 4 });
    const fetched = await questionAnswered(await getQuestion(api, published, readerToken));
    expect(fetched.rating).toEqual({ average: 4, count: 1, mine: 4 });
  });

  it("replaces a Viewer's Rating when they rate the same Question again", async () => {
    await rate(published, { value: 1 }, readerToken);
    await rate(published, { value: 5 }, reviewerToken);

    const rating = await ratingAnswered(await rate(published, { value: 3 }, readerToken));

    expect(rating).toEqual({ average: 4, count: 2, mine: 3 });
  });

  it("refuses an Author rating their own Question", async () => {
    const response = await rate(published, { value: 5 }, authorToken);

    expect(response.status).toBe(403);
  });

  it("refuses a Reviewer rating their own Question, because the rule is about who wrote it", async () => {
    const own = await addAQuestion(api, { text: "Who rates the rater?" }, reviewerToken);
    await postReviewAct(api, own, "publish", reviewerToken, { confirmedNotANearDuplicate: true });
    expect(
      (await questionAnswered(await getQuestion(api, own, reviewerToken))).publicationState,
    ).toBe("published");

    const response = await rate(own, { value: 5 }, reviewerToken);

    expect(response.status).toBe(403);
  });

  it("refuses a Reviewer rating a Pending or Rejected Question they can see", async () => {
    expect((await rate(pending, { value: 3 }, reviewerToken)).status).toBe(409);
    expect((await rate(rejected, { value: 3 }, reviewerToken)).status).toBe(409);
  });

  it("answers a Reader rating a Pending id, a restricted id and a missing id the same", async () => {
    const answers = [
      await statusAndBody(await rate(pending, { value: 3 }, readerToken)),
      await statusAndBody(await rate(publishedForTheSecondClient, { value: 3 }, readerToken)),
      await statusAndBody(await rate(unknownQuestionId, { value: 3 }, readerToken)),
    ];

    expect(answers[0]).toMatch(/^404 /);
    expect(new Set(answers).size).toBe(1);
    // The Viewer holding the Grant can rate that same restricted Question, so the match
    // above is the check at work and not a route that answers 404 to everything.
    expect((await rate(publishedForTheSecondClient, { value: 3 }, reviewerToken)).status).toBe(200);
  });

  it("answers a Viewer holding no Grant the same way for each of the three", async () => {
    const answers = [
      await statusAndBody(await rate(pending, { value: 3 }, noGrantToken)),
      await statusAndBody(await rate(publishedForTheFirstClient, { value: 3 }, noGrantToken)),
      await statusAndBody(await rate(unknownQuestionId, { value: 3 }, noGrantToken)),
    ];

    expect(answers[0]).toMatch(/^404 /);
    expect(new Set(answers).size).toBe(1);
    expect((await rate(publishedForTheFirstClient, { value: 3 }, readerToken)).status).toBe(200);
  });

  it("answers a malformed id as a missing one", async () => {
    const malformed = await statusAndBody(await rate("not-an-id", { value: 3 }, readerToken));

    expect(malformed).toBe(
      await statusAndBody(await rate(unknownQuestionId, { value: 3 }, readerToken)),
    );
  });

  it("writes no Change Event", async () => {
    const history = await historyOf(api, published, readerToken);
    const events = await api.database.changeEvent.count();

    await ratingAnswered(await rate(published, { value: 2 }, readerToken));
    await ratingAnswered(await rate(published, { value: 4 }, readerToken));

    expect(await historyOf(api, published, readerToken)).toEqual(history);
    expect(await api.database.changeEvent.count()).toBe(events);
  });

  it("refuses a value that is not a whole number from 1 to 5", async () => {
    for (const body of [{ value: 0 }, { value: 6 }, { value: 3.5 }, { value: "4" }, {}]) {
      expect((await rate(published, body, readerToken)).status).toBe(400);
    }
    expect(
      (await rate(published, { value: 4, viewerId: unknownQuestionId }, readerToken)).status,
    ).toBe(400);
  });
});
