import { questionResponseSchema, type Question } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  getQuestions,
  historyOf,
  idsListed,
  postReviewAct,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions these acts are tried on, all written by the seeded Author. */
const {
  aboutTypeScript: publishedAndUnrestricted,
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
  aboutTheClientsRendering: pendingForTheFirstClient,
} = seededQuestionIds;

const reason = { reason: "Say what a strong answer covers, not only a weak one." };

/**
 * Who may move a Pending Question into the bank or send it back, enforced by the API. The
 * order is the edit route's: a Question the Viewer cannot reach answers as an id that
 * names nothing, and only then is a role refused or a state found wrong (ADR-0002).
 */
describe("Publishing and Rejecting a Pending Question", () => {
  let api: TestApi;
  /** Author of every seeded Question, and holder of a Grant for the first Client. */
  let authorToken: string;
  /** Holds a Grant for the first Client too. */
  let readerToken: string;
  /** Holds a Grant for the second Client and none for the first. */
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

  /** The Question an act answered with, failing loudly on anything but a 200. */
  async function questionIn(response: Response): Promise<Question> {
    expect(response.status, await statusAndBody(response.clone())).toBe(200);
    return questionResponseSchema.parse(await response.json()).question;
  }

  /** What the same act answers for an id that names nothing, to hold a refusal against. */
  const unknownIdAnswer = async (act: "publish" | "reject", token: string) =>
    statusAndBody(await postReviewAct(api, unknownQuestionId, act, token, reason));

  it("puts a Published Question in front of Readers", async () => {
    const published = await questionIn(
      await postReviewAct(api, pendingAndUnrestricted, "publish", reviewerToken),
    );

    expect(published.publicationState).toBe("published");
    expect(published.reason).toBeNull();
    expect((await getQuestion(api, pendingAndUnrestricted, readerToken)).status).toBe(200);
    expect(await idsListed(await getQuestions(api, {}, readerToken))).toContain(
      pendingAndUnrestricted,
    );
  });

  it("keeps a Rejected Question away from Readers, as if it were not there", async () => {
    await questionIn(
      await postReviewAct(api, pendingAndUnrestricted, "reject", reviewerToken, reason),
    );

    const rejected = await getQuestion(api, pendingAndUnrestricted, readerToken);
    const nothing = await getQuestion(api, unknownQuestionId, readerToken);
    expect(await statusAndBody(rejected)).toBe(await statusAndBody(nothing));
    expect(await idsListed(await getQuestions(api, {}, readerToken))).not.toContain(
      pendingAndUnrestricted,
    );
  });

  it("hands the Author the reason their Question was Rejected", async () => {
    await postReviewAct(api, pendingAndUnrestricted, "reject", reviewerToken, reason);

    const asTheAuthorSeesIt = await questionIn(
      await getQuestion(api, pendingAndUnrestricted, authorToken),
    );

    expect(asTheAuthorSeesIt.publicationState).toBe("rejected");
    expect(asTheAuthorSeesIt.reason).toBe(reason.reason);
  });

  it("lets a Reviewer Publish their own submission, recorded as the same Viewer doing both", async () => {
    const theirOwn = await addAQuestion(
      api,
      { text: "Which production incident taught you the most, and what changed after it?" },
      reviewerToken,
    );

    await questionIn(await postReviewAct(api, theirOwn, "publish", reviewerToken));

    const events = await historyOf(api, theirOwn, reviewerToken);
    expect(events.map(({ type, viewerEmail }) => [type, viewerEmail])).toEqual([
      ["question_added", seededViewer("reviewer").email],
      ["question_published", seededViewer("reviewer").email],
    ]);
  });

  it("refuses an Author Publishing their own Question", async () => {
    const response = await postReviewAct(api, pendingAndUnrestricted, "publish", authorToken);

    expect(response.status).toBe(403);
  });

  it("answers a Reader Publishing or Rejecting a Pending Question as if it were not there", async () => {
    for (const act of ["publish", "reject"] as const) {
      const response = await postReviewAct(api, pendingAndUnrestricted, act, readerToken, reason);

      expect(await statusAndBody(response)).toBe(await unknownIdAnswer(act, readerToken));
    }
  });

  it("refuses a Reader Publishing or Rejecting a Question they can see", async () => {
    for (const act of ["publish", "reject"] as const) {
      const response = await postReviewAct(api, publishedAndUnrestricted, act, readerToken, reason);

      expect(response.status).toBe(403);
    }
  });

  it("answers a Reviewer holding no Grant for the Client as if the Question were not there", async () => {
    for (const act of ["publish", "reject"] as const) {
      const response = await postReviewAct(
        api,
        pendingForTheFirstClient,
        act,
        reviewerToken,
        reason,
      );

      expect(await statusAndBody(response)).toBe(await unknownIdAnswer(act, reviewerToken));
    }
  });

  it("lets an Author withdraw their own Pending Question by Rejecting it", async () => {
    const withdrawn = await questionIn(
      await postReviewAct(api, pendingAndUnrestricted, "reject", authorToken, reason),
    );

    expect(withdrawn.publicationState).toBe("rejected");
    const events = await historyOf(api, pendingAndUnrestricted, authorToken);
    expect(events.map(({ type, viewerEmail }) => [type, viewerEmail])).toEqual([
      ["question_rejected", seededViewer("author").email],
    ]);
  });

  it("refuses an Author Rejecting a Pending Question that is not theirs", async () => {
    const otherAuthorToken = await logInHoldingNoGrant(api, "author");

    const response = await postReviewAct(
      api,
      pendingAndUnrestricted,
      "reject",
      otherAuthorToken,
      reason,
    );

    // They cannot see another Author's Pending Question at all, so not even a 403.
    expect(await statusAndBody(response)).toBe(await unknownIdAnswer("reject", otherAuthorToken));
  });

  it("refuses a Rejection with no reason, or only whitespace for one", async () => {
    for (const body of [{}, { reason: "   " }]) {
      const response = await postReviewAct(
        api,
        pendingAndUnrestricted,
        "reject",
        reviewerToken,
        body,
      );

      expect(response.status).toBe(400);
    }
  });

  it("refuses an act on a Question not in the state it starts from", async () => {
    const tries = [
      postReviewAct(api, publishedAndUnrestricted, "publish", reviewerToken),
      postReviewAct(api, publishedAndUnrestricted, "reject", reviewerToken, reason),
      // Resubmitting comes first; a Reviewer does not Publish over the Author's head.
      postReviewAct(api, rejectedAndUnrestricted, "publish", reviewerToken),
      postReviewAct(api, rejectedAndUnrestricted, "reject", reviewerToken, reason),
    ];

    for (const response of await Promise.all(tries)) expect(response.status).toBe(409);
  });

  it("records each act as one Change Event naming who did it", async () => {
    await postReviewAct(api, pendingAndUnrestricted, "reject", reviewerToken, reason);

    const events = await historyOf(api, pendingAndUnrestricted, reviewerToken);

    expect(
      events.map(({ type, viewerEmail, payload }) => ({ type, viewerEmail, payload })),
    ).toEqual([
      { type: "question_rejected", viewerEmail: seededViewer("reviewer").email, payload: reason },
    ]);
  });

  it("Publishes once, and records once, when two Reviewers Publish at the same moment", async () => {
    const otherReviewerToken = await logInHoldingNoGrant(api, "reviewer");

    const answers = await Promise.all([
      postReviewAct(api, pendingAndUnrestricted, "publish", reviewerToken),
      postReviewAct(api, pendingAndUnrestricted, "publish", otherReviewerToken),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const events = await historyOf(api, pendingAndUnrestricted, reviewerToken);
    expect(events.filter(({ type }) => type === "question_published")).toHaveLength(1);
  });
});
