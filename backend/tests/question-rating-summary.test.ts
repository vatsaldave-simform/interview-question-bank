import {
  questionListResponseSchema,
  questionResponseSchema,
  type QuestionListResponse,
  type RatingSummary,
  type Viewer,
} from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveRating } from "../src/features/ratings/ratings.repository.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  aViewer,
  getQuestion,
  getQuestions,
  inOneAnswerNoteOnly,
  patchQuestion,
  postQuestion,
  aQuestion,
  questionAnswered,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const {
  aboutTypeScript: rated,
  aboutDisagreeing: pending,
  aboutTwoPlusTwo: rejected,
} = seededQuestionIds;

const nobodyRatedIt: RatingSummary = { average: null, count: 0, mine: null };

async function listed(response: Response): Promise<QuestionListResponse["questions"]> {
  if (response.status !== 200) throw new Error(`The list answered ${response.status}.`);
  return questionListResponseSchema.parse(await response.json()).questions;
}

/** Over HTTP, because the promise is about what a response holds and what it leaves out. */
describe("the Rating summary on every Question", () => {
  let api: TestApi;
  let reader: Viewer;
  let readerToken: string;
  let authorToken: string;
  let reviewerToken: string;
  /** Rated the TypeScript Question, and holds no role any test signs in with. */
  let otherRater: Viewer;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    reader = await viewerByRole(api.database, "reader");
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    otherRater = await aViewer(api.database, "author");

    await saveRating(api.database, reader, rated, 2);
    await saveRating(api.database, otherRater, rated, 5);
    // A Question returned from the bank keeps the Ratings it was given there, which is how a
    // Pending one comes to carry any.
    await saveRating(api.database, await viewerByRole(api.database, "reviewer"), pending, 4);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("gives the fetched Question its average, its count and the asking Viewer's own Rating", async () => {
    const forReader = await questionAnswered(await getQuestion(api, rated, readerToken));
    const forReviewer = await questionAnswered(await getQuestion(api, rated, reviewerToken));

    expect(forReader.rating).toEqual({ average: 3.5, count: 2, mine: 2 });
    expect(forReviewer.rating).toEqual({ average: 3.5, count: 2, mine: null });
  });

  it("gives every Question in the list its own summary", async () => {
    const questions = await listed(await getQuestions(api, {}, readerToken));

    const byId = new Map(questions.map((question) => [question.id, question.rating]));
    expect(byId.get(rated)).toEqual({ average: 3.5, count: 2, mine: 2 });
    expect(byId.get(seededQuestionIds.aboutTheClientsPipeline)).toEqual(nobodyRatedIt);
  });

  it("gives a Question found by keyword search its summary", async () => {
    const questions = await listed(
      await getQuestions(api, { keywords: inOneAnswerNoteOnly }, readerToken),
    );

    expect(questions.map((question) => [question.id, question.rating])).toEqual([
      [rated, { average: 3.5, count: 2, mine: 2 }],
    ]);
  });

  it("gives the Questions in the Pending queue and in an Author's own list their summaries", async () => {
    const queue = await listed(
      await api.request("/api/questions/pending", {
        headers: { authorization: `Bearer ${reviewerToken}` },
      }),
    );
    const own = await listed(
      await api.request("/api/questions/own", {
        headers: { authorization: `Bearer ${authorToken}` },
      }),
    );

    expect(queue.find((question) => question.id === pending)?.rating).toEqual({
      average: 4,
      count: 1,
      mine: 4,
    });
    expect(own.find((question) => question.id === pending)?.rating).toEqual({
      average: 4,
      count: 1,
      mine: null,
    });
    expect(own.find((question) => question.id === rejected)?.rating).toEqual(nobodyRatedIt);
  });

  it("gives the Question an act answers with its summary too", async () => {
    const edited = await questionAnswered(
      await patchQuestion(
        api,
        pending,
        { answerNotes: "Look for: they say so early." },
        reviewerToken,
      ),
    );

    expect(edited.rating).toEqual({ average: 4, count: 1, mine: 4 });
  });

  it("gives a new Question a summary saying nobody has rated it", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: "Why is a Rating never shown attributed?" }),
      authorToken,
    );

    expect(response.status).toBe(201);
    expect(questionResponseSchema.parse(await response.json()).question.rating).toEqual(
      nobodyRatedIt,
    );
  });

  it("names no Viewer who gave a Rating in any response about the Question", async () => {
    const id = await addAQuestion(api, { text: "What does an average hide?" }, authorToken);
    await api.request(`/api/questions/${id}/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${reviewerToken}`,
      },
      body: JSON.stringify({ confirmedNotANearDuplicate: true }),
    });
    await saveRating(api.database, otherRater, id, 1);
    await saveRating(api.database, otherRater, pending, 2);

    const asked: [string, string][] = [
      [`/api/questions/${id}`, readerToken],
      ["/api/questions", readerToken],
      ["/api/questions?keywords=average", readerToken],
      [`/api/questions/${id}/history`, readerToken],
      ["/api/questions/pending", reviewerToken],
      ["/api/questions/own", authorToken],
    ];
    const bodies = await Promise.all(
      asked.map(async ([path, token]) =>
        (await api.request(path, { headers: { authorization: `Bearer ${token}` } })).text(),
      ),
    );

    for (const body of bodies) {
      expect(body).not.toContain(otherRater.id);
      expect(body).not.toContain(otherRater.email);
    }
    // The Ratings are there to be found, so the absence above is not an empty page's.
    expect(bodies[2]).toContain(id);
    expect(bodies[0]).toContain('"count":1');
    expect(bodies[4]).toContain('"count":2');
  });
});
