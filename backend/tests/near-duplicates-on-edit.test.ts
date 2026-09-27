import { apiErrorSchema, nearDuplicatesFoundSchema, type ChangeEventType } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  historyOf,
  patchQuestion,
  postReviewAct,
  questionAnswered,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  whoDidWhat,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** A reworded copy of the Published, unrestricted TypeScript Question. */
const nearlyTheTypeScriptOne =
  "Explain the difference between an interface and a type in TypeScript.";

/** A reworded copy of the Published Question restricted to the second Client, which the
 * Author holds no Grant for. */
const nearlyTheOtherClientsBookingOne =
  "How would you move this client's Python booking service onto the shared data model?";

/** A reworded copy of the Pending Question restricted to the second Client, which the
 * Reviewer holds the Grant for. */
const nearlyTheOtherClientsIntakeOne =
  "Which part of this client's intake process would you automate first, and why?";

/** A Question nothing in the seeded bank resembles, and a rewording of it. */
const aboutCaching =
  "How would you introduce a cache without making staleness someone else's problem?";
const nearlyTheCachingOne =
  "How would you introduce a cache without making its staleness somebody else's problem?";

/**
 * Detection runs on an edit that changes a Published Question's text, so a sound Question
 * cannot be rewritten into a Near-Duplicate with nothing watching (ADR-0014).
 */
describe("editing a Published Question's text into one that resembles another", () => {
  let api: TestApi;
  /** Author of every seeded Question, and holder of a Grant for the first Client. */
  let authorToken: string;
  /** Holds a Grant for the second Client and none for the first. */
  let reviewerToken: string;
  const authorEmail = seededViewer("author").email;

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

  /** The Near-Duplicates a refused edit names, failing loudly on any other answer. */
  async function nearDuplicatesNamed(response: Response): Promise<string[]> {
    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    return nearDuplicatesFoundSchema
      .parse(body.error.details)
      .nearDuplicates.map((near) => near.questionId);
  }

  /** A Published Question that already resembles the TypeScript one, let through by an
   * override at both submission and publication. */
  async function aPublishedNearDuplicate(): Promise<string> {
    const confirmed = { confirmedNotANearDuplicate: true };
    const id = await addAQuestion(api, { text: nearlyTheTypeScriptOne, ...confirmed }, authorToken);
    await questionAnswered(await postReviewAct(api, id, "publish", reviewerToken, confirmed));
    return id;
  }

  /** The kinds of event a Viewer reads in one Question's history. */
  async function eventTypes(id: string, token: string): Promise<ChangeEventType[]> {
    return (await historyOf(api, id, token)).map((event) => event.type);
  }

  it("refuses the edit, names what it resembles, and changes nothing", async () => {
    const id = seededQuestionIds.aboutTheClientsPipeline;
    const before = await questionAnswered(await getQuestion(api, id, authorToken));

    const response = await patchQuestion(api, id, { text: nearlyTheTypeScriptOne }, authorToken);

    expect(await nearDuplicatesNamed(response)).toEqual([seededQuestionIds.aboutTypeScript]);
    expect(await questionAnswered(await getQuestion(api, id, authorToken))).toEqual(before);
  });

  it("records the refused edit against the Question and the Viewer who tried it", async () => {
    const id = seededQuestionIds.aboutTheClientsPipeline;

    await patchQuestion(api, id, { text: nearlyTheTypeScriptOne }, authorToken);

    const refused = (await historyOf(api, id, authorToken)).find(
      (event) => event.type === "near_duplicate_refused",
    );
    expect(refused?.viewerEmail).toBe(authorEmail);
    expect(refused?.questionId).toBe(id);
    expect(refused?.payload).toMatchObject({
      attempted: { text: nearlyTheTypeScriptOne },
      nearDuplicates: [{ questionId: seededQuestionIds.aboutTypeScript }],
    });
  });

  it("never names the Question being edited as its own Near-Duplicate", async () => {
    const id = seededQuestionIds.aboutTypeScript;

    const response = await patchQuestion(api, id, { text: nearlyTheTypeScriptOne }, authorToken);

    expect((await questionAnswered(response)).text).toBe(nearlyTheTypeScriptOne);
  });

  it("saves the edit once its editor confirms it is genuinely different, and says who did", async () => {
    const id = seededQuestionIds.aboutTheClientsPipeline;

    const response = await patchQuestion(
      api,
      id,
      { text: nearlyTheTypeScriptOne, confirmedNotANearDuplicate: true },
      authorToken,
    );

    expect((await questionAnswered(response)).text).toBe(nearlyTheTypeScriptOne);
    const events = await historyOf(api, id, authorToken);
    // Written in one transaction, so the two can share a time and their order is not
    // the point here.
    expect(whoDidWhat(events)).toEqual(
      expect.arrayContaining([
        ["question_edited", authorEmail],
        ["near_duplicate_overridden", authorEmail],
      ]),
    );
    const overridden = events.find((event) => event.type === "near_duplicate_overridden");
    expect(overridden?.payload).toMatchObject({
      nearDuplicates: [{ questionId: seededQuestionIds.aboutTypeScript }],
    });
  });

  it("runs no check on an edit to the Answer Notes alone", async () => {
    const id = await aPublishedNearDuplicate();

    const response = await patchQuestion(
      api,
      id,
      { answerNotes: "Listen for when each one can be extended." },
      authorToken,
    );

    expect(response.status).toBe(200);
    expect(await eventTypes(id, authorToken)).not.toContain<ChangeEventType>(
      "near_duplicate_refused",
    );
  });

  it("runs no check on an edit to the Tags alone", async () => {
    const id = await aPublishedNearDuplicate();
    const { tags } = await questionAnswered(
      await getQuestion(api, seededQuestionIds.aboutTypeScript, authorToken),
    );

    const response = await patchQuestion(api, id, { tags }, authorToken);

    expect(response.status).toBe(200);
    expect(await eventTypes(id, authorToken)).not.toContain<ChangeEventType>(
      "near_duplicate_refused",
    );
  });

  it("treats the same text sent again as no change to the text", async () => {
    const id = await aPublishedNearDuplicate();

    const response = await patchQuestion(
      api,
      id,
      { text: nearlyTheTypeScriptOne, answerNotes: "Listen for when each one can be extended." },
      authorToken,
    );

    expect(response.status).toBe(200);
  });

  it("runs no check on an edit to a Pending Question, which Publishing will check", async () => {
    const id = seededQuestionIds.aboutDisagreeing;

    const response = await patchQuestion(api, id, { text: nearlyTheTypeScriptOne }, authorToken);

    expect((await questionAnswered(response)).text).toBe(nearlyTheTypeScriptOne);
  });

  it("never names a Pending Question", async () => {
    await addAQuestion(api, { text: aboutCaching }, reviewerToken);

    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: nearlyTheCachingOne },
      authorToken,
    );

    expect(response.status).toBe(200);
  });

  it("never names a restricted Question the editor holds no Grant for", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: nearlyTheOtherClientsBookingOne },
      authorToken,
    );

    expect(response.status).toBe(200);
  });

  it("holds a Reviewer editing to Published Questions alone, as it holds an Author", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTheOtherClientsBooking,
      { text: nearlyTheOtherClientsIntakeOne },
      reviewerToken,
    );

    expect(response.status).toBe(200);
  });

  it("refuses a confirmation that comes with nothing to change", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { confirmedNotANearDuplicate: true },
      authorToken,
    );

    expect(response.status).toBe(400);
  });
});
