import { questionResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedQuestions } from "../src/features/questions/questions.seed.js";
import { logIn, seededViewer } from "./helpers/auth.js";
import { getQuestion, seedTheBank, unknownQuestionId } from "./helpers/question-bank.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

const publishedAndUnrestricted = seedQuestions[0]!.id;
const publishedAndRestricted = seedQuestions[1]!.id;
const pendingAndRestricted = seedQuestions[4]!.id;

/**
 * What a caller can and cannot learn from `GET /api/questions/:id`. The seam is already
 * tested directly; what only exists here is the response — the status and the bytes a
 * refused caller actually receives (ADR-0002).
 */
describe("fetching a Question over HTTP", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("returns the restricted Question to a Viewer holding the Permission Grant", async () => {
    // The seeded Reader holds the Grant; a Grant is a separate fact from a role.
    const token = await logIn(api, seededViewer("reader"));

    const response = await getQuestion(api, publishedAndRestricted, token);

    expect(response.status).toBe(200);
    const body = questionResponseSchema.parse(await response.json());
    expect(body.question.id).toBe(publishedAndRestricted);
  });

  it("answers a Viewer holding no Grant with the same status and the same bytes as an unknown id", async () => {
    const token = await logIn(api, seededViewer("reviewer"));

    const restricted = await getQuestion(api, publishedAndRestricted, token);
    const unknown = await getQuestion(api, unknownQuestionId, token);

    expect(restricted.status).toBe(unknown.status);
    expect(restricted.status).toBe(404);
    expect(await restricted.text()).toBe(await unknown.text());
  });

  // Both gates at once, which ADR-0013 says have to hold in combination: this Question
  // is restricted AND Pending, and the Reviewer holds no Grant for its Client.
  it("answers a Question that is both restricted and Pending with those same bytes", async () => {
    const token = await logIn(api, seededViewer("reviewer"));

    const both = await getQuestion(api, pendingAndRestricted, token);
    const unknown = await getQuestion(api, unknownQuestionId, token);

    expect(both.status).toBe(404);
    expect(await both.text()).toBe(await unknown.text());
  });

  it("returns an unrestricted Question to every authenticated Viewer", async () => {
    for (const role of ["reader", "author", "reviewer"] as const) {
      const token = await logIn(api, seededViewer(role));

      const response = await getQuestion(api, publishedAndUnrestricted, token);

      expect(response.status).toBe(200);
      const body = questionResponseSchema.parse(await response.json());
      expect(body.question.id).toBe(publishedAndUnrestricted);
    }
  });

  it("answers a malformed id as it answers an unknown one, rather than as a bad request", async () => {
    const token = await logIn(api, seededViewer("reader"));

    const malformed = await getQuestion(api, "not-a-uuid", token);
    const unknown = await getQuestion(api, unknownQuestionId, token);

    expect(malformed.status).toBe(404);
    expect(await malformed.text()).toBe(await unknown.text());
  });

  it("refuses an unauthenticated caller, and says nothing about the Question", async () => {
    const response = await api.request(`/api/questions/${publishedAndUnrestricted}`);

    expect(response.status).toBe(401);
  });
});
