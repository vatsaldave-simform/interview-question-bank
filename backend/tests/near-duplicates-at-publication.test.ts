import { apiErrorSchema, nearDuplicatesFoundSchema, type ChangeEventType } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  historyOf,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** The text `aQuestion` sends, reworded: alike enough to be a Near-Duplicate of it. */
const nearlyTheCacheOne =
  "How would you introduce a cache without making its staleness somebody else's problem?";

/** A reworded copy of a Pending Question restricted to the first Client, which the
 * Reviewer holds no Grant for. */
const nearlyTheClientsRenderingOne =
  "Walk me through the trade-offs of this client's current React rendering strategy.";

/** A reworded copy of a Pending Question restricted to the second Client, which the
 * Reviewer holds the Grant for. */
const nearlyTheOtherClientsIntakeOne =
  "Which part of this client's intake process would you automate first, and why?";

/** The seeded Rejected Question, written the way a person might type it again. */
const nearlyTheRejectedOne = "What is 2+2?";

/**
 * Detection runs again when a Reviewer Publishes, over the Questions the queue lets them
 * see, so a Question is caught even when what it duplicates arrived while it waited
 * (ADR-0014).
 */
describe("Publishing a Question that resembles one already in the bank or the queue", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client. */
  let authorToken: string;
  /** Holds a Grant for the second Client and none for the first. */
  let reviewerToken: string;
  const reviewerEmail = seededViewer("reviewer").email;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** The Near-Duplicates a refused act names, failing loudly on any other answer. */
  async function nearDuplicatesNamed(response: Response): Promise<string[]> {
    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    return nearDuplicatesFoundSchema
      .parse(body.error.details)
      .nearDuplicates.map((near) => near.questionId);
  }

  it("catches a Question that duplicates one Published while it waited", async () => {
    // Both pass at submission: each resembles only a Pending Question, and the Author is
    // checked against Published Questions alone.
    const waiting = await addAQuestion(api, {}, authorToken);
    const publishedMeanwhile = await addAQuestion(api, { text: nearlyTheCacheOne }, authorToken);
    // The Reviewer is told about the waiting one here, and Publishes anyway.
    await questionAnswered(
      await postReviewAct(api, publishedMeanwhile, "publish", reviewerToken, {
        confirmedNotANearDuplicate: true,
      }),
    );

    const response = await postReviewAct(api, waiting, "publish", reviewerToken);

    expect(await nearDuplicatesNamed(response)).toEqual([publishedMeanwhile]);
  });

  it("names a Pending Question waiting in the queue beside it", async () => {
    const waiting = await addAQuestion(api, {}, authorToken);
    const alike = await addAQuestion(api, { text: nearlyTheCacheOne }, authorToken);

    const response = await postReviewAct(api, alike, "publish", reviewerToken);

    expect(await nearDuplicatesNamed(response)).toEqual([waiting]);
  });

  it("never names the Question being Published as its own Near-Duplicate", async () => {
    const id = await addAQuestion(api, {}, authorToken);

    const response = await postReviewAct(api, id, "publish", reviewerToken);

    expect((await questionAnswered(response)).publicationState).toBe("published");
  });

  it("names a restricted Pending Question the Reviewer holds the Grant for", async () => {
    const id = await addAQuestion(api, { text: nearlyTheOtherClientsIntakeOne }, authorToken);

    const response = await postReviewAct(api, id, "publish", reviewerToken);

    expect(await nearDuplicatesNamed(response)).toEqual([
      seededQuestionIds.aboutTheOtherClientsIntake,
    ]);
  });

  it("never names a restricted Pending Question the Reviewer holds no Grant for", async () => {
    const id = await addAQuestion(api, { text: nearlyTheClientsRenderingOne }, authorToken);

    const response = await postReviewAct(api, id, "publish", reviewerToken);

    expect((await questionAnswered(response)).publicationState).toBe("published");
  });

  it("never names a Rejected Question, which is in neither the bank nor the queue", async () => {
    const id = await addAQuestion(api, { text: nearlyTheRejectedOne }, authorToken);

    const response = await postReviewAct(api, id, "publish", reviewerToken);

    expect((await questionAnswered(response)).publicationState).toBe("published");
  });

  it("answers a Question that is not Pending with its state, not with Near-Duplicates", async () => {
    // A Pending Question the Published one resembles, which detection would have named.
    await addAQuestion(
      api,
      {
        text: "Explain the difference between an interface and a type in TypeScript.",
        confirmedNotANearDuplicate: true,
      },
      authorToken,
    );

    const response = await postReviewAct(
      api,
      seededQuestionIds.aboutTypeScript,
      "publish",
      reviewerToken,
    );

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.message).toBe("Only a Pending Question can be Published.");
    expect(body.error.details).toBeUndefined();
  });

  it("leaves a refused Question Pending, and records the refusal against the Reviewer", async () => {
    const waiting = await addAQuestion(api, {}, authorToken);
    const alike = await addAQuestion(api, { text: nearlyTheCacheOne }, authorToken);

    await postReviewAct(api, alike, "publish", reviewerToken);

    const question = await questionAnswered(await getQuestion(api, alike, reviewerToken));
    expect(question.publicationState).toBe("pending");
    const refused = (await historyOf(api, alike, reviewerToken)).find(
      (event) => event.type === "near_duplicate_refused",
    );
    expect(refused?.viewerEmail).toBe(reviewerEmail);
    expect(refused?.questionId).toBe(alike);
    expect(refused?.payload).toMatchObject({
      attempted: { text: nearlyTheCacheOne },
      nearDuplicates: [{ questionId: waiting }],
    });
  });

  it("keeps the refusal from the Author, whose history it names another Question in", async () => {
    await addAQuestion(api, {}, authorToken);
    const alike = await addAQuestion(api, { text: nearlyTheCacheOne }, authorToken);

    await postReviewAct(api, alike, "publish", reviewerToken);

    const types = (await historyOf(api, alike, authorToken)).map((event) => event.type);
    expect(types).toEqual<ChangeEventType[]>(["question_added"]);
  });

  it("Publishes once the Reviewer confirms it is genuinely different, and says who did", async () => {
    const waiting = await addAQuestion(api, {}, authorToken);
    const alike = await addAQuestion(api, { text: nearlyTheCacheOne }, authorToken);

    const response = await postReviewAct(api, alike, "publish", reviewerToken, {
      confirmedNotANearDuplicate: true,
    });

    expect((await questionAnswered(response)).publicationState).toBe("published");
    const events = await historyOf(api, alike, reviewerToken);
    // Written in one transaction, so the two can share a time and their order is not
    // the point here.
    expect(whoDidWhat(events)).toEqual(
      expect.arrayContaining([
        ["question_published", reviewerEmail],
        ["near_duplicate_overridden", reviewerEmail],
      ]),
    );
    const overridden = events.find((event) => event.type === "near_duplicate_overridden");
    expect(overridden?.payload).toMatchObject({
      nearDuplicates: [{ questionId: waiting }],
    });
  });

  it("records no override when there was no Near-Duplicate to overrule", async () => {
    const id = await addAQuestion(api, {}, authorToken);

    await postReviewAct(api, id, "publish", reviewerToken, {
      confirmedNotANearDuplicate: true,
    });

    const types = (await historyOf(api, id, reviewerToken)).map((event) => event.type);
    expect(types).not.toContain<ChangeEventType>("near_duplicate_overridden");
  });
});
