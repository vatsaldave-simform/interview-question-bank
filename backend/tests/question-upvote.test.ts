import { upvoteResponseSchema, type UpvoteSummary } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInAsAnother, seededViewer } from "./helpers/auth.ts";
import {
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

/** All written by the seeded Author, and the Published one seeded with their Upvote. */
const {
  aboutTypeScript: published,
  aboutDisagreeing: pending,
  aboutTwoPlusTwo: rejected,
  aboutTheOtherClientsBooking: publishedForTheSecondClient,
  aboutTheOtherClientsIntake: pendingForTheSecondClient,
} = seededQuestionIds;

/** Over HTTP, because "cannot be told apart" means the status and the bytes (ADR-0002). */
describe("upvoting a Question and taking it back", () => {
  let api: TestApi;
  let readerToken: string;
  let authorToken: string;
  let reviewerToken: string;
  let otherReaderToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    otherReaderToken = await logInAsAnother(api, "reader");
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  function upvote(id: string, token: string): Promise<Response> {
    return api.request(`/api/questions/${id}/upvote`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function takeBack(id: string, token: string): Promise<Response> {
    return api.request(`/api/questions/${id}/upvote`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function upvotesAnswered(response: Response): Promise<UpvoteSummary> {
    if (response.status !== 200) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return upvoteResponseSchema.parse(await response.json()).upvotes;
  }

  it("lets a Reader upvote a Published Question, and the Question then carries it", async () => {
    const upvotes = await upvotesAnswered(await upvote(published, readerToken));

    // Two: the Reader's, and the Author's from the seed.
    expect(upvotes).toEqual({ count: 2, mine: true });
    const fetched = await questionAnswered(await getQuestion(api, published, readerToken));
    expect(fetched.upvotes).toEqual({ count: 2, mine: true });
  });

  it("counts a second Upvote from the same Viewer once", async () => {
    await upvote(published, readerToken);

    const upvotes = await upvotesAnswered(await upvote(published, readerToken));

    expect(upvotes).toEqual({ count: 2, mine: true });
  });

  it("takes an Upvote back, and taking it back again changes nothing", async () => {
    await upvote(published, readerToken);

    expect(await upvotesAnswered(await takeBack(published, readerToken))).toEqual({
      count: 1,
      mine: false,
    });
    expect(await upvotesAnswered(await takeBack(published, readerToken))).toEqual({
      count: 1,
      mine: false,
    });
  });

  it("lets an Author take back the Upvote Publishing gave them, and give it again", async () => {
    expect(await upvotesAnswered(await takeBack(published, authorToken))).toEqual({
      count: 0,
      mine: false,
    });

    expect(await upvotesAnswered(await upvote(published, authorToken))).toEqual({
      count: 1,
      mine: true,
    });
  });

  it("refuses an Upvote on a Pending or Rejected Question the Viewer can see", async () => {
    expect((await upvote(pending, reviewerToken)).status).toBe(409);
    expect((await upvote(rejected, authorToken)).status).toBe(409);
  });

  it("lets a Viewer take back an Upvote from a returned Question, which keeps the rest", async () => {
    await upvote(published, readerToken);
    await postReviewAct(api, published, "return", reviewerToken, {
      reason: "Say what a strong answer covers.",
    });

    const upvotes = await upvotesAnswered(await takeBack(published, authorToken));

    // The Reader's is kept, though a Reader can no longer see the Question.
    expect(upvotes).toEqual({ count: 1, mine: false });
  });

  it("answers a Reader upvoting a Pending id, whatever Client it names, as a missing id", async () => {
    const answers = [
      await statusAndBody(await upvote(pending, readerToken)),
      await statusAndBody(await upvote(pendingForTheSecondClient, readerToken)),
      await statusAndBody(await upvote(unknownQuestionId, readerToken)),
      await statusAndBody(await takeBack(pending, readerToken)),
      await statusAndBody(await takeBack(unknownQuestionId, readerToken)),
    ];

    expect(answers[0]).toMatch(/^404 /);
    expect(new Set(answers).size).toBe(1);
    // A Published one naming a Client takes the Upvote, so the match above is the check at
    // work and not a route that answers 404 to everything.
    expect((await upvote(publishedForTheSecondClient, otherReaderToken)).status).toBe(200);
  });

  it("answers a malformed id as a missing one", async () => {
    const malformed = await statusAndBody(await upvote("not-an-id", readerToken));

    expect(malformed).toBe(await statusAndBody(await upvote(unknownQuestionId, readerToken)));
  });

  it("writes no Change Event", async () => {
    const history = await historyOf(api, published, readerToken);
    const events = await api.database.changeEvent.count();

    await upvotesAnswered(await upvote(published, readerToken));
    await upvotesAnswered(await takeBack(published, readerToken));

    expect(await historyOf(api, published, readerToken)).toEqual(history);
    expect(await api.database.changeEvent.count()).toBe(events);
  });

  it("refuses a request with no sign-in", async () => {
    const response = await api.request(`/api/questions/${published}/upvote`, { method: "PUT" });

    expect(response.status).toBe(401);
  });
});
