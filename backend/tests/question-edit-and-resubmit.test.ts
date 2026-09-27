import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  getQuestion,
  historyOf,
  idsListed,
  patchQuestion,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions these are tried on, all written by the seeded Author. */
const {
  aboutTypeScript: publishedAndUnrestricted,
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
} = seededQuestionIds;

const newText = "Tell me about a time you changed your mind in a design review. What did it?";

/**
 * The Author's half of review. Editing a Pending or Rejected Question is the edit route as
 * it already is; what this holds it to is that an edit never moves a Question between
 * Publication States, and only an explicit resubmit returns a Rejected one to the queue.
 */
describe("editing a Question under review, and resubmitting a Rejected one", () => {
  let api: TestApi;
  /** Author of every seeded Question. */
  let authorToken: string;
  let readerToken: string;
  let reviewerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const theQueue = async () =>
    idsListed(
      await api.request("/api/questions/pending", {
        headers: { authorization: `Bearer ${reviewerToken}` },
      }),
    );

  it("lets an Author edit their own Pending Question, which stays Pending", async () => {
    const edited = await questionAnswered(
      await patchQuestion(api, pendingAndUnrestricted, { text: newText }, authorToken),
    );

    expect(edited.text).toBe(newText);
    expect(edited.publicationState).toBe("pending");
  });

  it("lets a Reviewer edit a Pending Question and then Publish what they wrote", async () => {
    await questionAnswered(
      await patchQuestion(api, pendingAndUnrestricted, { text: newText }, reviewerToken),
    );
    await questionAnswered(
      await postReviewAct(api, pendingAndUnrestricted, "publish", reviewerToken),
    );

    const asAReaderSeesIt = await questionAnswered(
      await getQuestion(api, pendingAndUnrestricted, readerToken),
    );
    expect(asAReaderSeesIt.text).toBe(newText);
  });

  it("leaves an edited Rejected Question Rejected, and out of the queue", async () => {
    const edited = await questionAnswered(
      await patchQuestion(api, rejectedAndUnrestricted, { text: newText }, authorToken),
    );

    expect(edited.publicationState).toBe("rejected");
    expect(edited.reason).toBe("Nobody learns anything about a candidate from this.");
    expect(await theQueue()).not.toContain(rejectedAndUnrestricted);
  });

  it("puts a resubmitted Question back in the queue with no reason on it", async () => {
    const resubmitted = await questionAnswered(
      await postReviewAct(api, rejectedAndUnrestricted, "resubmit", authorToken),
    );

    expect(resubmitted.publicationState).toBe("pending");
    expect(resubmitted.reason).toBeNull();
    expect(await theQueue()).toContain(rejectedAndUnrestricted);
  });

  it("answers another Author resubmitting it as if it were not there", async () => {
    const otherAuthorToken = await logInHoldingNoGrant(api, "author");

    const response = await postReviewAct(
      api,
      rejectedAndUnrestricted,
      "resubmit",
      otherAuthorToken,
    );

    const nothing = await postReviewAct(api, unknownQuestionId, "resubmit", otherAuthorToken);
    expect(await statusAndBody(response)).toBe(await statusAndBody(nothing));
  });

  it("refuses a Reviewer resubmitting a Question that is not theirs", async () => {
    const response = await postReviewAct(api, rejectedAndUnrestricted, "resubmit", reviewerToken);

    expect(response.status).toBe(403);
  });

  it("refuses a Reader resubmitting, and hides a Question they cannot see", async () => {
    const hidden = await postReviewAct(api, rejectedAndUnrestricted, "resubmit", readerToken);
    const seen = await postReviewAct(api, publishedAndUnrestricted, "resubmit", readerToken);

    const nothing = await postReviewAct(api, unknownQuestionId, "resubmit", readerToken);
    expect(await statusAndBody(hidden)).toBe(await statusAndBody(nothing));
    expect(seen.status).toBe(403);
  });

  it("refuses resubmitting a Question that is not Rejected", async () => {
    const response = await postReviewAct(api, pendingAndUnrestricted, "resubmit", authorToken);

    expect(response.status).toBe(409);
  });

  it("records the edit and the resubmit as two Change Events, in that order", async () => {
    await patchQuestion(api, rejectedAndUnrestricted, { text: newText }, authorToken);
    await postReviewAct(api, rejectedAndUnrestricted, "resubmit", authorToken);

    const events = await historyOf(api, rejectedAndUnrestricted, authorToken);

    const author = seededViewer("author").email;
    expect(events.at(-1)?.payload).toEqual({});
    expect(whoDidWhat(events)).toEqual([
      ["question_edited", author],
      ["question_resubmitted", author],
    ]);
  });
});
