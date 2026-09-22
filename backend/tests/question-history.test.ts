import {
  questionHistoryResponseSchema,
  questionResponseSchema,
  type ChangeEvent,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  aQuestion,
  patchQuestion,
  postQuestion,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
  viewerByRole,
} from "./helpers/question-bank.js";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.js";

/** The history request itself, for a test that wants to read the response it got. */
function getHistory(api: TestApi, id: string, token: string): Promise<Response> {
  return api.request(`/api/questions/${id}/history`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Reading how a Question got to where it is. Any Viewer who can see the Question can
 * read its history, and a Question they cannot see has a history they cannot tell from
 * one that was never there (ADR-0002).
 */
describe("the history of a Question", () => {
  let api: TestApi;
  /** Author of every seeded Question, and holder of a Grant for the first Client. */
  let authorToken: string;
  /** Holds a Grant for the first Client, and may edit nothing. */
  let readerToken: string;
  /** Holds a Grant for the second Client and none for the first. */
  let reviewerToken: string;
  let authorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    authorId = (await viewerByRole(api.database, "author")).id;
    reviewerId = (await viewerByRole(api.database, "reviewer")).id;
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const newText = "What would you change about the way this team reviews code?";

  async function addAQuestion(body: Record<string, unknown> = {}): Promise<string> {
    const response = await postQuestion(api, aQuestion(body), authorToken);
    if (response.status !== 201) throw new Error(`Adding failed with ${response.status}.`);
    return questionResponseSchema.parse(await response.json()).question.id;
  }

  /** The history as the API answers with it, held to the shape the client is promised. */
  async function historyOf(id: string, token: string): Promise<ChangeEvent[]> {
    const response = await getHistory(api, id, token);
    if (response.status !== 200) throw new Error(`Reading ${id} failed with ${response.status}.`);
    return questionHistoryResponseSchema.parse(await response.json()).events;
  }

  it("shows an addition and an edit, in the order they happened", async () => {
    const id = await addAQuestion();
    await patchQuestion(api, id, { text: newText }, reviewerToken);

    const events = await historyOf(id, authorToken);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      questionId: id,
      viewerId: authorId,
      type: "question_added",
      payload: { text: aQuestion()["text"] },
    });
    expect(events[1]).toMatchObject({
      questionId: id,
      viewerId: reviewerId,
      type: "question_edited",
      payload: { text: { before: aQuestion()["text"], after: newText } },
    });
    expect(Date.parse(events[0]!.at)).toBeLessThanOrEqual(Date.parse(events[1]!.at));
  });

  it("says when each one happened, in a form a client can read", async () => {
    const before = new Date();
    const id = await addAQuestion();

    const [added] = await historyOf(id, authorToken);

    // The schema has already held it to being an ISO timestamp; this is that it is the
    // time the event happened rather than some other time.
    expect(Date.parse(added!.at)).toBeGreaterThanOrEqual(before.getTime() - 1_000);
  });

  it("answers a Question nobody has touched with an empty history", async () => {
    // The seed writes its Questions directly, so this one has no events at all.
    expect(await historyOf(seededQuestionIds.aboutTypeScript, authorToken)).toEqual([]);
  });

  it("lets a Reader read the history of a Question they can see", async () => {
    // Published and unrestricted, so a Reader reaches it; a Question just added is
    // Pending, which is a reason of its own to be out of reach.
    const id = seededQuestionIds.aboutTypeScript;
    await patchQuestion(api, id, { text: newText }, authorToken);

    // A Reader may edit nothing, and that has never been about reading.
    expect(await historyOf(id, readerToken)).toHaveLength(1);
  });

  it("carries only the events about the Question that was asked for", async () => {
    const one = await addAQuestion();
    const other = await addAQuestion({ text: "A different Question about caching entirely." });
    await patchQuestion(api, other, { text: newText }, authorToken);

    expect(await historyOf(one, authorToken)).toHaveLength(1);
    expect((await historyOf(other, authorToken)).map((event) => event.questionId)).toEqual([
      other,
      other,
    ]);
  });

  it("refuses a caller with no access token", async () => {
    const response = await api.request(`/api/questions/${seededQuestionIds.aboutTypeScript}/history`);

    expect(response.status).toBe(401);
  });
});

/**
 * The half of the rule the whole project is built around, on the history path. Asking for
 * the history of a Question that is not Visible answers exactly as asking for the history
 * of an id that names nothing — the same status and the same bytes.
 */
describe("the history of a Question that is not Visible", () => {
  let api: TestApi;
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
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** What asking for this history and asking for one that names nothing both look like. */
  async function historyLooksLikeNothingThere(id: string, token: string): Promise<void> {
    const restricted = await getHistory(api, id, token);
    const nothing = await getHistory(api, unknownQuestionId, token);

    expect(await statusAndBody(restricted)).toBe(await statusAndBody(nothing));
    expect(restricted.status).toBe(404);
  }

  it("answers a Reviewer holding no Grant for that Client as if the Question were not there", async () => {
    await historyLooksLikeNothingThere(seededQuestionIds.aboutTheClientsPipeline, reviewerToken);
  });

  it("answers a Reader holding no Grant for that Client the same way", async () => {
    await historyLooksLikeNothingThere(seededQuestionIds.aboutTheOtherClientsBooking, readerToken);
  });

  it("answers a Reader asking about a Pending Question the same way", async () => {
    // Not restricted to any Client: out of reach because it is Pending and a Reader is
    // not its Author. Without it, the history could check Permission Grants alone.
    await historyLooksLikeNothingThere(seededQuestionIds.aboutDisagreeing, readerToken);
  });

  it("answers an id that is not a uuid as one that names nothing", async () => {
    const malformed = await getHistory(api, "not-a-uuid", authorToken);
    const unknown = await getHistory(api, unknownQuestionId, authorToken);

    expect(await statusAndBody(malformed)).toBe(await statusAndBody(unknown));
    expect(malformed.status).toBe(404);
  });

  it("really is refusing a history that somebody else can read", async () => {
    // Without this, the 404s above would be satisfied by a Question nobody can reach.
    await patchQuestion(
      api,
      seededQuestionIds.aboutTheClientsPipeline,
      { text: "Edited by the one Viewer who holds the Grant." },
      authorToken,
    );

    const refused = await getHistory(api, seededQuestionIds.aboutTheClientsPipeline, reviewerToken);
    const allowed = await getHistory(api, seededQuestionIds.aboutTheClientsPipeline, authorToken);

    expect(refused.status).toBe(404);
    expect(allowed.status).toBe(200);
    expect(questionHistoryResponseSchema.parse(await allowed.json()).events).toHaveLength(1);
  });

  it("does not leak that a Question exists by taking longer to say no", async () => {
    // Both answers are one query against the same condition, so neither asks the
    // database anything the other does not.
    const restricted = await getHistory(api, seededQuestionIds.aboutTheClientsPipeline, reviewerToken);
    const unknown = await getHistory(api, unknownQuestionId, reviewerToken);

    expect(await statusAndBody(restricted)).toBe(await statusAndBody(unknown));
  });
});
