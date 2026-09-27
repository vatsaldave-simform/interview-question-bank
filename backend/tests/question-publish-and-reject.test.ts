import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  getQuestions,
  historyOf,
  idsListed,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions these acts are tried on, all written by the seeded Author. */
const {
  aboutTypeScript: publishedAndUnrestricted,
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
  aboutTheClientsRendering: pendingForTheFirstClient,
  aboutTheOtherClientsIntake: pendingForTheSecondClient,
} = seededQuestionIds;

const rejectBody = { reason: "Say what a strong answer covers, not only a weak one." };

/** Each act's own body, since a Publish naming a reason is refused at the edge. */
const bodyFor = (act: "publish" | "reject") => (act === "reject" ? rejectBody : {});

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

  /** What the same act answers for an id that names nothing, to hold a refusal against. */
  const unknownIdAnswer = async (act: "publish" | "reject", token: string) =>
    statusAndBody(await postReviewAct(api, unknownQuestionId, act, token, bodyFor(act)));

  it("puts a Published Question in front of Readers", async () => {
    const published = await questionAnswered(
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
    await questionAnswered(
      await postReviewAct(api, pendingAndUnrestricted, "reject", reviewerToken, rejectBody),
    );

    const rejected = await getQuestion(api, pendingAndUnrestricted, readerToken);
    const nothing = await getQuestion(api, unknownQuestionId, readerToken);
    expect(await statusAndBody(rejected)).toBe(await statusAndBody(nothing));
    expect(await idsListed(await getQuestions(api, {}, readerToken))).not.toContain(
      pendingAndUnrestricted,
    );
  });

  it("hands the Author the reason their Question was Rejected", async () => {
    await postReviewAct(api, pendingAndUnrestricted, "reject", reviewerToken, rejectBody);

    const asTheAuthorSeesIt = await questionAnswered(
      await getQuestion(api, pendingAndUnrestricted, authorToken),
    );

    expect(asTheAuthorSeesIt.publicationState).toBe("rejected");
    expect(asTheAuthorSeesIt.reason).toBe(rejectBody.reason);
  });

  it("lets a Reviewer Publish their own Question, recorded as the same Viewer doing both", async () => {
    const theirOwn = await addAQuestion(
      api,
      { text: "Which production incident taught you the most, and what changed after it?" },
      reviewerToken,
    );

    await questionAnswered(await postReviewAct(api, theirOwn, "publish", reviewerToken));

    expect(whoDidWhat(await historyOf(api, theirOwn, reviewerToken))).toEqual([
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
      const response = await postReviewAct(
        api,
        pendingAndUnrestricted,
        act,
        readerToken,
        bodyFor(act),
      );

      expect(await statusAndBody(response)).toBe(await unknownIdAnswer(act, readerToken));
    }
  });

  it("refuses a Reader Publishing or Rejecting a Question they can see", async () => {
    for (const act of ["publish", "reject"] as const) {
      const response = await postReviewAct(
        api,
        publishedAndUnrestricted,
        act,
        readerToken,
        bodyFor(act),
      );

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
        bodyFor(act),
      );

      expect(await statusAndBody(response)).toBe(await unknownIdAnswer(act, reviewerToken));
    }
  });

  it("lets an Author withdraw their own Pending Question by Rejecting it", async () => {
    const withdrawn = await questionAnswered(
      await postReviewAct(api, pendingAndUnrestricted, "reject", authorToken, rejectBody),
    );

    expect(withdrawn.publicationState).toBe("rejected");
    expect(whoDidWhat(await historyOf(api, pendingAndUnrestricted, authorToken))).toEqual([
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
      rejectBody,
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
      postReviewAct(api, publishedAndUnrestricted, "reject", reviewerToken, rejectBody),
      // Resubmitting comes first; a Reviewer does not Publish over the Author's head.
      postReviewAct(api, rejectedAndUnrestricted, "publish", reviewerToken),
      postReviewAct(api, rejectedAndUnrestricted, "reject", reviewerToken, rejectBody),
      // An Author withdraws only what is still waiting; a Published one is out of their hands.
      postReviewAct(api, publishedAndUnrestricted, "reject", authorToken, rejectBody),
    ];

    for (const response of await Promise.all(tries)) expect(response.status).toBe(409);
  });

  it("records each act as one Change Event naming who did it and carrying its payload", async () => {
    await postReviewAct(api, pendingAndUnrestricted, "publish", reviewerToken);
    await postReviewAct(api, pendingForTheSecondClient, "reject", reviewerToken, rejectBody);

    const whatWasRecorded = async (id: string) =>
      (await historyOf(api, id, reviewerToken)).map(({ type, viewerEmail, payload }) => ({
        type,
        viewerEmail,
        payload,
      }));

    const reviewer = seededViewer("reviewer").email;
    expect(await whatWasRecorded(pendingAndUnrestricted)).toEqual([
      { type: "question_published", viewerEmail: reviewer, payload: {} },
    ]);
    expect(await whatWasRecorded(pendingForTheSecondClient)).toEqual([
      { type: "question_rejected", viewerEmail: reviewer, payload: rejectBody },
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
