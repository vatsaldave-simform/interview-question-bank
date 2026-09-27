import { questionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import {
  logIn,
  logInHoldingGrantsFor,
  logInHoldingNoGrant,
  seededViewer,
} from "./helpers/auth.ts";
import {
  clientIdNamed,
  getQuestion,
  getQuestions,
  historyOf,
  idsListed,
  inOneAnswerNoteOnly,
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

/** The seeded Questions this is tried on, all written by the seeded Author. */
const {
  // The only Question whose Answer Notes hold `inOneAnswerNoteOnly`.
  aboutTypeScript: publishedAndUnrestricted,
  // The Author and the Reader hold the first Client's Grant, and the seeded Reviewer does not.
  aboutTheClientsPipeline: publishedForTheFirstClient,
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
} = seededQuestionIds;

const returnBody = { reason: "This belongs to a Client. Restrict it before it goes back in." };

/**
 * A Reviewer taking a Published Question out of the bank and handing it back to its Author.
 * It becomes Rejected, so it waits for its Author and not in the queue (ADR-0013).
 */
describe("returning a Published Question to its Author", () => {
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

  const returnIt = (id: string, token: string, body: unknown = returnBody) =>
    postReviewAct(api, id, "return", token, body);

  const searchedFor = async (keywords: string) =>
    idsListed(await getQuestions(api, { keywords }, readerToken));

  const authorsOwnList = async () => {
    const response = await api.request("/api/questions/own", {
      headers: { authorization: `Bearer ${authorToken}` },
    });
    return questionListResponseSchema.parse(await response.json()).questions;
  };

  it("takes it out of a Reader's search at once", async () => {
    expect(await searchedFor(inOneAnswerNoteOnly)).toContain(publishedAndUnrestricted);

    await questionAnswered(await returnIt(publishedAndUnrestricted, reviewerToken));

    expect(await searchedFor(inOneAnswerNoteOnly)).not.toContain(publishedAndUnrestricted);
  });

  it("answers a Reader fetching it afterwards as if it did not exist", async () => {
    await questionAnswered(await returnIt(publishedAndUnrestricted, reviewerToken));

    const returned = await getQuestion(api, publishedAndUnrestricted, readerToken);
    const nothing = await getQuestion(api, unknownQuestionId, readerToken);

    expect(await statusAndBody(returned)).toBe(await statusAndBody(nothing));
  });

  it("lists it for its Author as Rejected, with the reason attached", async () => {
    await questionAnswered(await returnIt(publishedAndUnrestricted, reviewerToken));

    const listed = (await authorsOwnList()).find(({ id }) => id === publishedAndUnrestricted);

    expect(listed).toMatchObject({ publicationState: "rejected", reason: returnBody.reason });
  });

  it("hides a Question restricted to a Client from that Client's Readers, and hands it to its Author", async () => {
    const clientId = await clientIdNamed(api.database, seedClient.name);
    const grantedReviewerToken = await logInHoldingGrantsFor(api, "reviewer", [clientId]);

    await questionAnswered(await returnIt(publishedForTheFirstClient, grantedReviewerToken));

    const returned = await getQuestion(api, publishedForTheFirstClient, readerToken);
    const nothing = await getQuestion(api, unknownQuestionId, readerToken);
    expect(await statusAndBody(returned)).toBe(await statusAndBody(nothing));
    expect(await idsListed(await getQuestions(api, {}, readerToken))).not.toContain(
      publishedForTheFirstClient,
    );
    expect((await authorsOwnList()).map(({ id }) => id)).toContain(publishedForTheFirstClient);
    const resubmitted = await questionAnswered(
      await postReviewAct(api, publishedForTheFirstClient, "resubmit", authorToken),
    );
    expect(resubmitted.publicationState).toBe("pending");
  });

  it("goes back in the bank once its Author corrects and resubmits it and a Reviewer Publishes it", async () => {
    await questionAnswered(await returnIt(publishedAndUnrestricted, reviewerToken));
    await questionAnswered(
      await patchQuestion(
        api,
        publishedAndUnrestricted,
        { text: "How would you type a function whose return type depends on its input?" },
        authorToken,
      ),
    );

    const resubmitted = await questionAnswered(
      await postReviewAct(api, publishedAndUnrestricted, "resubmit", authorToken),
    );
    expect(resubmitted).toMatchObject({ publicationState: "pending", reason: null });

    await questionAnswered(
      await postReviewAct(api, publishedAndUnrestricted, "publish", reviewerToken),
    );
    expect((await getQuestion(api, publishedAndUnrestricted, readerToken)).status).toBe(200);
    expect(whoDidWhat(await historyOf(api, publishedAndUnrestricted, authorToken))).toEqual([
      ["question_returned", seededViewer("reviewer").email],
      ["question_edited", seededViewer("author").email],
      ["question_resubmitted", seededViewer("author").email],
      ["question_published", seededViewer("reviewer").email],
    ]);
  });

  it("records the return as one Change Event naming the Reviewer and carrying the reason", async () => {
    await questionAnswered(await returnIt(publishedAndUnrestricted, reviewerToken));

    const events = await historyOf(api, publishedAndUnrestricted, reviewerToken);

    expect(
      events.map(({ type, viewerEmail, payload }) => ({ type, viewerEmail, payload })),
    ).toEqual([
      {
        type: "question_returned",
        viewerEmail: seededViewer("reviewer").email,
        payload: returnBody,
      },
    ]);
  });

  it("refuses its Author, and a Reader, returning a Question they can see", async () => {
    for (const token of [authorToken, readerToken]) {
      const response = await returnIt(publishedAndUnrestricted, token);

      expect(response.status).toBe(403);
    }
  });

  it("answers a Reviewer holding no Grant for the Client as if the Question were not there", async () => {
    const response = await returnIt(publishedForTheFirstClient, reviewerToken);
    const nothing = await returnIt(unknownQuestionId, reviewerToken);

    expect(await statusAndBody(response)).toBe(await statusAndBody(nothing));
  });

  it("refuses to return a Question that is not Published", async () => {
    for (const id of [pendingAndUnrestricted, rejectedAndUnrestricted]) {
      const response = await returnIt(id, reviewerToken);

      expect(response.status).toBe(409);
      expect(await response.text()).toContain("Only a Published Question can be returned.");
    }
  });

  it("refuses a return with no reason, or only whitespace for one", async () => {
    for (const body of [{}, { reason: "   " }]) {
      const response = await returnIt(publishedAndUnrestricted, reviewerToken, body);

      expect(response.status).toBe(400);
    }
  });

  it("returns once, and records once, when two Reviewers return it at the same moment", async () => {
    const otherReviewerToken = await logInHoldingNoGrant(api, "reviewer");

    const answers = await Promise.all([
      returnIt(publishedAndUnrestricted, reviewerToken),
      returnIt(publishedAndUnrestricted, otherReviewerToken),
    ]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const events = await historyOf(api, publishedAndUnrestricted, reviewerToken);
    expect(events.filter(({ type }) => type === "question_returned")).toHaveLength(1);
  });
});
