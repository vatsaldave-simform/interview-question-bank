import { apiErrorSchema } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
import { logIn, logInHoldingGrantsFor, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  clientIdNamed,
  getQuestion,
  historyOf,
  patchQuestion,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** The seeded Questions this is tried on, all written by the seeded Author. */
const {
  aboutTypeScript: publishedAndUnrestricted,
  aboutDisagreeing: pendingAndUnrestricted,
  // The Author and the Reader hold the first Client's Grant, and the seeded Reviewer does not.
  aboutTheClientsPipeline: publishedForTheFirstClient,
  aboutTheClientsRendering: pendingForTheFirstClient,
  // The seeded Reviewer holds the second Client's Grant, and the Author and the Reader do not.
  aboutTheOtherClientsBooking: publishedForTheSecondClient,
} = seededQuestionIds;

/** Authors narrow, Reviewers widen, and only a Question's own Author moves it, while it is
 * out of the bank (ADR-0018). */
describe("restricting a Question to a Client, and removing the restriction", () => {
  let api: TestApi;
  let firstClientId: string;
  let secondClientId: string;
  /** Author of every seeded Question, and holder of the first Client's Grant only. */
  let authorToken: string;
  /** Holds the first Client's Grant only. */
  let readerToken: string;
  /** Holds the second Client's Grant only. */
  let reviewerToken: string;
  /** An Author and a Reviewer holding both Grants, so a move is refused for its own reason
   * and not because the Client it is moved to is out of reach. */
  let authorOfBothToken: string;
  let reviewerOfBothToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    firstClientId = await clientIdNamed(api.database, seedClient.name);
    secondClientId = await clientIdNamed(api.database, seedOtherClient.name);
    authorToken = await logIn(api, seededViewer("author"));
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    authorOfBothToken = await logInHoldingGrantsFor(api, "author", [firstClientId, secondClientId]);
    reviewerOfBothToken = await logInHoldingGrantsFor(api, "reviewer", [
      firstClientId,
      secondClientId,
    ]);
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const classify = (id: string, clientId: unknown, token: string) =>
    api.request(`/api/questions/${id}/classify`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId }),
    });

  const declassify = (id: string, token: string) =>
    api.request(`/api/questions/${id}/declassify`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

  const clientIdOf = async (id: string) =>
    (await api.database.question.findUniqueOrThrow({ where: { id }, select: { clientId: true } }))
      .clientId;

  const typesInHistory = async (id: string, token: string) =>
    (await historyOf(api, id, token)).map(({ type }) => type);

  const refusal = async (response: Response) => ({
    status: response.status,
    error: apiErrorSchema.parse(await response.json()).error,
  });

  /** The same bytes as the answer for an id that names nothing, which is what a Question
   * the Viewer cannot see has to look like (ADR-0002). */
  const expectMissing = async (response: Response, unknown: Response) => {
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(await unknown.text());
  };

  /** A Question added by the Author holding both Grants, restricted to the first Client, with
   * text no seeded Question resembles so that Publishing it meets no Near-Duplicate. */
  const addedByTheAuthorOfBoth = (text: string) =>
    addAQuestion(api, { text, clientId: firstClientId }, authorOfBothToken);

  describe("attaching a restriction", () => {
    it("lets an Author restrict their own Published Question", async () => {
      const question = await questionAnswered(
        await classify(publishedAndUnrestricted, firstClientId, authorToken),
      );

      expect(question.client?.id).toBe(firstClientId);
      expect(await clientIdOf(publishedAndUnrestricted)).toBe(firstClientId);
    });

    it("hides it at once from a Reviewer holding no Grant for the Client", async () => {
      await questionAnswered(await classify(publishedAndUnrestricted, firstClientId, authorToken));

      await expectMissing(
        await getQuestion(api, publishedAndUnrestricted, reviewerToken),
        await getQuestion(api, unknownQuestionId, reviewerToken),
      );
    });

    it("records it as its own event naming the Author, and not as an edit", async () => {
      await questionAnswered(await classify(publishedAndUnrestricted, firstClientId, authorToken));

      const events = await historyOf(api, publishedAndUnrestricted, authorToken);
      const last = events.at(-1);
      expect(whoDidWhat([last!])).toEqual([["question_classified", seededViewer("author").email]]);
      expect(last).toMatchObject({ payload: { clientId: { before: null, after: firstClientId } } });
      expect(events.map(({ type }) => type)).not.toContain("question_edited");
    });

    it("lets an Author restrict their own Pending Question", async () => {
      const question = await questionAnswered(
        await classify(pendingAndUnrestricted, firstClientId, authorToken),
      );

      expect(question.client?.id).toBe(firstClientId);
    });

    it("lets a Reviewer restrict their own Question", async () => {
      const id = await addAQuestion(
        api,
        { text: "Which alert would you delete first from a noisy dashboard?" },
        reviewerToken,
      );

      const question = await questionAnswered(await classify(id, secondClientId, reviewerToken));

      expect(question.client?.id).toBe(secondClientId);
    });

    it("refuses a Reviewer restricting another Viewer's Question, which could hide it from them", async () => {
      const refused = await refusal(
        await classify(publishedAndUnrestricted, secondClientId, reviewerToken),
      );

      expect(refused.status).toBe(403);
      expect(await clientIdOf(publishedAndUnrestricted)).toBeNull();
      expect((await getQuestion(api, publishedAndUnrestricted, authorToken)).status).toBe(200);
    });

    it("refuses an Author restricting a Question another Viewer wrote", async () => {
      const id = await addAQuestion(
        api,
        { text: "What would you measure first when a checkout page feels slow?" },
        reviewerOfBothToken,
      );
      // Published, since another Viewer's Pending Question is out of the Author's reach.
      await questionAnswered(await postReviewAct(api, id, "publish", reviewerOfBothToken));

      expect((await refusal(await classify(id, firstClientId, authorToken))).status).toBe(403);
      expect(await clientIdOf(id)).toBeNull();
    });

    it("refuses a Reader", async () => {
      const response = await classify(publishedAndUnrestricted, firstClientId, readerToken);

      expect((await refusal(response)).status).toBe(403);
      expect(await clientIdOf(publishedAndUnrestricted)).toBeNull();
    });

    it("refuses a Client the Viewer holds no Grant for exactly as one that does not exist", async () => {
      const notHeld = await refusal(
        await classify(publishedAndUnrestricted, secondClientId, authorToken),
      );
      const noSuchClient = await refusal(
        await classify(publishedAndUnrestricted, crypto.randomUUID(), authorToken),
      );

      expect(notHeld.status).toBe(400);
      expect(notHeld.error.message).toBe("No such Client.");
      expect(notHeld).toEqual(noSuchClient);
      expect(await clientIdOf(publishedAndUnrestricted)).toBeNull();
    });

    it("answers a Question the Viewer cannot see as one that does not exist", async () => {
      await expectMissing(
        await classify(publishedForTheFirstClient, secondClientId, reviewerToken),
        await classify(unknownQuestionId, secondClientId, reviewerToken),
      );
    });

    it("changes nothing and records nothing when it is already restricted to that Client", async () => {
      const before = await typesInHistory(publishedForTheFirstClient, authorToken);

      const question = await questionAnswered(
        await classify(publishedForTheFirstClient, firstClientId, authorToken),
      );

      expect(question.client?.id).toBe(firstClientId);
      expect(await typesInHistory(publishedForTheFirstClient, authorToken)).toEqual(before);
    });

    it("refuses a Client id that is not a uuid at the edge", async () => {
      const response = await classify(publishedAndUnrestricted, "northwind", authorToken);

      expect((await refusal(response)).status).toBe(400);
    });

    it("is still refused through an edit, which is not how a restriction changes", async () => {
      const response = await patchQuestion(
        api,
        publishedAndUnrestricted,
        { clientId: firstClientId },
        authorToken,
      );

      expect((await refusal(response)).status).toBe(400);
      expect(await clientIdOf(publishedAndUnrestricted)).toBeNull();
    });
  });

  describe("moving it from one Client to another", () => {
    it("refuses an Author moving their own Published Question", async () => {
      const id = await addedByTheAuthorOfBoth("How do you decide when a feature flag has to go?");
      await questionAnswered(await postReviewAct(api, id, "publish", reviewerOfBothToken));

      const refused = await refusal(await classify(id, secondClientId, authorOfBothToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(id)).toBe(firstClientId);
    });

    it("refuses a Reviewer moving a Published Question, their own included", async () => {
      const id = await addAQuestion(
        api,
        { text: "Which log line saved you the most time last year?", clientId: firstClientId },
        reviewerOfBothToken,
      );
      await questionAnswered(await postReviewAct(api, id, "publish", reviewerOfBothToken));

      const refused = await refusal(await classify(id, secondClientId, reviewerOfBothToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(id)).toBe(firstClientId);
    });

    it("refuses a Reviewer moving one in two steps, by removing the restriction first", async () => {
      const id = await addedByTheAuthorOfBoth("How would you split a service nobody owns?");
      await questionAnswered(await postReviewAct(api, id, "publish", reviewerOfBothToken));
      await questionAnswered(await declassify(id, reviewerOfBothToken));

      const refused = await refusal(await classify(id, secondClientId, reviewerOfBothToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(id)).toBeNull();
    });

    it("refuses a Reviewer moving their own to a Client they hold no Grant for", async () => {
      const id = await addAQuestion(
        api,
        { text: "What do you check before you trust a green build?", clientId: secondClientId },
        reviewerToken,
      );

      const refused = await refusal(await classify(id, firstClientId, reviewerToken));

      expect(refused.status).toBe(400);
      expect(refused.error.message).toBe("No such Client.");
      expect(await clientIdOf(id)).toBe(secondClientId);
    });

    it("refuses a Reviewer moving another Viewer's Pending Question", async () => {
      const id = await addedByTheAuthorOfBoth("How would you explain an index to a new tester?");

      const refused = await refusal(await classify(id, secondClientId, reviewerOfBothToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(id)).toBe(firstClientId);
    });

    it("lets an Author move their own Pending Question to a Client they hold a Grant for", async () => {
      const id = await addedByTheAuthorOfBoth("Tell me about a migration you had to roll back.");

      const question = await questionAnswered(await classify(id, secondClientId, authorOfBothToken));

      expect(question.client?.id).toBe(secondClientId);
      const last = (await historyOf(api, id, authorOfBothToken)).at(-1);
      expect(last).toMatchObject({
        type: "question_classified",
        payload: { clientId: { before: firstClientId, after: secondClientId } },
      });
    });

    it("lets the Author fix one a Reviewer returned for being on the wrong Client", async () => {
      const id = await addedByTheAuthorOfBoth("What makes an on-call handover actually useful?");
      await questionAnswered(await postReviewAct(api, id, "publish", reviewerOfBothToken));
      await questionAnswered(
        await postReviewAct(api, id, "return", reviewerOfBothToken, {
          reason: "This is the other Client's material.",
        }),
      );

      const question = await questionAnswered(await classify(id, secondClientId, authorOfBothToken));

      expect(question.client?.id).toBe(secondClientId);
      expect(question.publicationState).toBe("rejected");
    });

    it("lets a Reviewer move their own Pending Question, as its Author", async () => {
      const id = await addAQuestion(
        api,
        { text: "How do you keep a design review from turning into a vote?", clientId: firstClientId },
        reviewerOfBothToken,
      );

      const question = await questionAnswered(
        await classify(id, secondClientId, reviewerOfBothToken),
      );

      expect(question.client?.id).toBe(secondClientId);
    });

    it("refuses an Author moving one to a Client they hold no Grant for", async () => {
      const refused = await refusal(
        await classify(pendingForTheFirstClient, secondClientId, authorToken),
      );

      expect(refused.status).toBe(400);
      expect(refused.error.message).toBe("No such Client.");
      expect(await clientIdOf(pendingForTheFirstClient)).toBe(firstClientId);
    });
  });

  describe("removing a restriction", () => {
    it("refuses an Author removing it from their own Published Question", async () => {
      const refused = await refusal(await declassify(publishedForTheFirstClient, authorToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(publishedForTheFirstClient)).toBe(firstClientId);
    });

    it("refuses an Author removing it from their own Pending Question too", async () => {
      const refused = await refusal(await declassify(pendingForTheFirstClient, authorToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(pendingForTheFirstClient)).toBe(firstClientId);
    });

    it("refuses a Reader", async () => {
      const refused = await refusal(await declassify(publishedForTheFirstClient, readerToken));

      expect(refused.status).toBe(403);
      expect(await clientIdOf(publishedForTheFirstClient)).toBe(firstClientId);
    });

    it("lets a Reviewer remove it, which shows it to a Reader holding no Grant", async () => {
      expect((await getQuestion(api, publishedForTheSecondClient, readerToken)).status).toBe(404);

      const question = await questionAnswered(
        await declassify(publishedForTheSecondClient, reviewerToken),
      );

      expect(question.client).toBeNull();
      expect((await getQuestion(api, publishedForTheSecondClient, readerToken)).status).toBe(200);
    });

    it("records it as its own event naming the Reviewer and the Client, and not as an edit", async () => {
      await questionAnswered(await declassify(publishedForTheSecondClient, reviewerToken));

      const events = await historyOf(api, publishedForTheSecondClient, reviewerToken);
      const last = events.at(-1);
      expect(whoDidWhat([last!])).toEqual([
        ["question_declassified", seededViewer("reviewer").email],
      ]);
      expect(last).toMatchObject({ payload: { clientId: secondClientId } });
      expect(events.map(({ type }) => type)).not.toContain("question_edited");
    });

    it("answers a Reviewer holding no Grant for the Client as if the Question did not exist", async () => {
      await expectMissing(
        await declassify(publishedForTheFirstClient, reviewerToken),
        await declassify(unknownQuestionId, reviewerToken),
      );
      expect(await clientIdOf(publishedForTheFirstClient)).toBe(firstClientId);
    });

    it("refuses a Question with no restriction to remove", async () => {
      const refused = await refusal(await declassify(publishedAndUnrestricted, reviewerToken));

      expect(refused.status).toBe(409);
    });

    it("records one event when two Reviewers remove it at once", async () => {
      const responses = await Promise.all([
        declassify(publishedForTheSecondClient, reviewerToken),
        declassify(publishedForTheSecondClient, reviewerOfBothToken),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      const types = await typesInHistory(publishedForTheSecondClient, reviewerToken);
      expect(types.filter((type) => type === "question_declassified")).toHaveLength(1);
    });
  });
});
