import { pendingQuestionListResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  addAQuestion,
  getQuestion,
  inOneAnswerNoteOnly,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const { aboutDisagreeing: pendingAndUnrestricted, aboutTypeScript: published } =
  seededQuestionIds;

function getList(api: TestApi, path: string, token: string): Promise<Response> {
  return api.request(`/api/questions${path}`, { headers: { authorization: `Bearer ${token}` } });
}

/** The fields of each Question a list response carries, read before any schema can refuse
 * or drop one. */
async function fieldsOfEach(response: Response): Promise<string[][]> {
  if (response.status !== 200) throw new Error(`The list answered ${response.status}.`);
  const body = (await response.json()) as { questions: Record<string, unknown>[] };
  return body.questions.map((question) => Object.keys(question));
}

describe("who wrote a Pending Question", () => {
  let api: TestApi;
  let readerToken: string;
  let authorToken: string;
  let reviewerToken: string;
  let addedByTheReviewer: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    readerToken = await logIn(api, seededViewer("reader"));
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    // A second author in the queue, so the test can tell each Question's author apart.
    addedByTheReviewer = await addAQuestion(api, {}, reviewerToken);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("is named to a Reviewer, by id and email, on each Question in the queue", async () => {
    const author = await viewerByRole(api.database, "author");
    const reviewer = await viewerByRole(api.database, "reviewer");

    const response = await getList(api, "/pending", reviewerToken);

    const queue = pendingQuestionListResponseSchema.parse(await response.json()).questions;
    const authorOf = Object.fromEntries(queue.map((question) => [question.id, question.author]));
    expect(authorOf[pendingAndUnrestricted]).toEqual({ id: author.id, email: author.email });
    expect(authorOf[addedByTheReviewer]).toEqual({ id: reviewer.id, email: reviewer.email });
  });

  it("is named on no Question in Browse, to any role", async () => {
    for (const token of [readerToken, authorToken, reviewerToken]) {
      const fields = await fieldsOfEach(await getList(api, "", token));

      expect(fields.length).toBeGreaterThan(0);
      expect(fields.flat()).not.toContain("author");
    }
  });

  it("is named on no Question a keyword search finds", async () => {
    const fields = await fieldsOfEach(
      await getList(api, `?keywords=${inOneAnswerNoteOnly}`, reviewerToken),
    );

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.flat()).not.toContain("author");
  });

  it("is named on no Question in an Author's own list", async () => {
    const fields = await fieldsOfEach(await getList(api, "/own", authorToken));

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.flat()).not.toContain("author");
  });

  it("is not named when a Question is fetched on its own, even by a Reviewer", async () => {
    for (const id of [published, pendingAndUnrestricted]) {
      const response = await getQuestion(api, id, reviewerToken);

      const body = (await response.json()) as { question: Record<string, unknown> };
      expect(Object.keys(body.question)).not.toContain("author");
    }
  });
});
