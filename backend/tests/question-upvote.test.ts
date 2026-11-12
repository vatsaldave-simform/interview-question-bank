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
  /** An Author who added none of the seeded Questions, so has upvoted none of them. */
  let newcomerToken: string;
  let authorToken: string;
  let reviewerToken: string;
  let otherNewcomerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    newcomerToken = await logInAsAnother(api, "author");
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    otherNewcomerToken = await logInAsAnother(api, "author");
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

  it("lets a Viewer upvote someone else's Published Question, and the Question then carries it", async () => {
    const upvotes = await upvotesAnswered(await upvote(published, newcomerToken));

    // Two: the newcomer's, and the Author's from the seed.
    expect(upvotes).toEqual({ count: 2, mine: true });
    const fetched = await questionAnswered(await getQuestion(api, published, newcomerToken));
    expect(fetched.upvotes).toEqual({ count: 2, mine: true });
  });

  it("counts a second Upvote from the same Viewer once", async () => {
    await upvote(published, newcomerToken);

    const upvotes = await upvotesAnswered(await upvote(published, newcomerToken));

    expect(upvotes).toEqual({ count: 2, mine: true });
  });

  it("takes an Upvote back, and taking it back again changes nothing", async () => {
    await upvote(published, newcomerToken);

    expect(await upvotesAnswered(await takeBack(published, newcomerToken))).toEqual({
      count: 1,
      mine: false,
    });
    expect(await upvotesAnswered(await takeBack(published, newcomerToken))).toEqual({
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
    await upvote(published, newcomerToken);
    await postReviewAct(api, published, "return", reviewerToken, {
      reason: "Say what a strong answer covers.",
    });

    const upvotes = await upvotesAnswered(await takeBack(published, authorToken));

    // The newcomer's is kept, though they can no longer see the Question.
    expect(upvotes).toEqual({ count: 1, mine: false });
  });

  it("answers another Author upvoting a Pending id, whatever Client it names, as a missing id", async () => {
    const answers = [
      await statusAndBody(await upvote(pending, newcomerToken)),
      await statusAndBody(await upvote(pendingForTheSecondClient, newcomerToken)),
      await statusAndBody(await upvote(unknownQuestionId, newcomerToken)),
      await statusAndBody(await takeBack(pending, newcomerToken)),
      await statusAndBody(await takeBack(unknownQuestionId, newcomerToken)),
    ];

    expect(answers[0]).toMatch(/^404 /);
    expect(new Set(answers).size).toBe(1);
    // A Published one naming a Client takes the Upvote, so the match above is the check at
    // work and not a route that answers 404 to everything.
    expect((await upvote(publishedForTheSecondClient, otherNewcomerToken)).status).toBe(200);
  });

  it("answers a malformed id as a missing one", async () => {
    const malformed = await statusAndBody(await upvote("not-an-id", newcomerToken));

    expect(malformed).toBe(await statusAndBody(await upvote(unknownQuestionId, newcomerToken)));
  });

  it("writes no Change Event", async () => {
    const history = await historyOf(api, published, newcomerToken);
    const events = await api.database.changeEvent.count();

    await upvotesAnswered(await upvote(published, newcomerToken));
    await upvotesAnswered(await takeBack(published, newcomerToken));

    expect(await historyOf(api, published, newcomerToken)).toEqual(history);
    expect(await api.database.changeEvent.count()).toBe(events);
  });

  it("refuses a request with no sign-in", async () => {
    const response = await api.request(`/api/questions/${published}/upvote`, { method: "PUT" });

    expect(response.status).toBe(401);
  });
});
