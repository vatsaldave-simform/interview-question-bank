import { questionResponseSchema, type ChangeEventType } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  aQuestion,
  patchQuestion,
  postQuestion,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

/** The events about one Question, oldest first, as rows. */
async function eventsAbout(api: TestApi, questionId: string) {
  return api.database.changeEvent.findMany({
    where: { questionId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Every change to the bank leaves a trace naming who made it and when. Driven over HTTP,
 * because what has to be true is that the endpoints leave it, not that a function can.
 */
describe("the trace a change leaves", () => {
  let api: TestApi;
  let authorToken: string;
  let readerToken: string;
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

  /** Adds a Question over HTTP and hands back its id. */
  async function addAQuestion(body: Record<string, unknown> = {}): Promise<string> {
    const response = await postQuestion(api, aQuestion(body), authorToken);
    if (response.status !== 201) throw new Error(`Adding failed with ${response.status}.`);
    return questionResponseSchema.parse(await response.json()).question.id;
  }

  it("records the whole content of a Question that was added", async () => {
    const before = new Date();
    const id = await addAQuestion({
      provenance: "adapted",
      source: "A book somebody read",
      tags: [{ category: "technology", tag: "react" }],
    });

    const [added, ...rest] = await eventsAbout(api, id);

    expect(rest).toEqual([]);
    expect(added?.type).toBe<ChangeEventType>("question_added");
    expect(added?.viewerId).toBe(authorId);
    expect(added?.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1_000);
    expect(added?.payload).toEqual({
      text: aQuestion()["text"],
      answerNotes: aQuestion()["answerNotes"],
      provenance: "adapted",
      source: "A book somebody read",
      tags: [{ category: "technology", tag: "react" }],
    });
  });

  it("records an addition that named no Source or Tags as having named none", async () => {
    const id = await addAQuestion();

    const [added] = await eventsAbout(api, id);

    expect(added?.payload).toMatchObject({ source: null, tags: [] });
  });

  it("records an edit as the changed fields only, before and after", async () => {
    const id = await addAQuestion();

    await patchQuestion(api, id, { text: newText }, authorToken);

    const [, edited] = await eventsAbout(api, id);
    expect(edited?.type).toBe<ChangeEventType>("question_edited");
    // The Answer Notes are absent: the edit did not name them, so nothing about them
    // changed and the event says nothing about them.
    expect(edited?.payload).toEqual({
      text: { before: aQuestion()["text"], after: newText },
    });
  });

  it("gives adding then editing two events, with the Viewer who did each one", async () => {
    const id = await addAQuestion();

    await patchQuestion(api, id, { text: newText }, reviewerToken);

    const events = await eventsAbout(api, id);
    expect(events.map((event) => event.type)).toEqual<ChangeEventType[]>([
      "question_added",
      "question_edited",
    ]);
    expect(events.map((event) => event.viewerId)).toEqual([authorId, reviewerId]);
    expect(events[0]!.createdAt.getTime()).toBeLessThanOrEqual(events[1]!.createdAt.getTime());
  });

  it("records the Tags a Question carried and the ones it carries now", async () => {
    const id = await addAQuestion({ tags: [{ category: "technology", tag: "react" }] });
    const tags = [{ category: "technology", tag: "node" }];

    await patchQuestion(api, id, { tags }, authorToken);

    const [, edited] = await eventsAbout(api, id);
    expect(edited?.payload).toEqual({
      tags: { before: [{ category: "technology", tag: "react" }], after: tags },
    });
  });

  it("records nothing for an edit that names a field and leaves it as it was", async () => {
    const id = await addAQuestion();

    const response = await patchQuestion(api, id, { text: aQuestion()["text"] }, authorToken);

    expect(response.status).toBe(200);
    expect((await eventsAbout(api, id)).map((event) => event.type)).toEqual<ChangeEventType[]>([
      "question_added",
    ]);
  });

  it("records nothing about a Question the API refused to add", async () => {
    const before = await api.database.changeEvent.count();

    // A Reader may not add one, and the Tag in the second does not exist.
    await postQuestion(api, aQuestion(), readerToken);
    await postQuestion(
      api,
      aQuestion({ tags: [{ category: "technology", tag: "fortran" }] }),
      authorToken,
    );

    expect(await api.database.changeEvent.count()).toBe(before);
  });

  it("records nothing about an edit the API refused", async () => {
    const refused: [string, string][] = [
      // A Reader may not edit a Question they can see perfectly well.
      [seededQuestionIds.aboutTypeScript, readerToken],
      // This one the Reviewer holds no Permission Grant for, so it is not even there.
      [seededQuestionIds.aboutTheClientsPipeline, reviewerToken],
    ];

    for (const [id, token] of refused) {
      const response = await patchQuestion(api, id, { text: newText }, token);

      expect(response.status).not.toBe(200);
      expect(await eventsAbout(api, id)).toEqual([]);
    }
  });

  it("writes the event and the Question together, so neither can arrive without the other", async () => {
    const id = await addAQuestion();

    // A Question with no event would mean the event is written after the transaction
    // commits, and a crash in between would lose it.
    const questions = await api.database.question.count({ where: { id } });
    expect(questions).toBe(1);
    expect(await eventsAbout(api, id)).toHaveLength(1);
  });
});
