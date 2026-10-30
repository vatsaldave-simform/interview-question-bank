import { questionResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedQuestions } from "../src/features/questions/questions.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { getQuestion, seedTheBank, unknownQuestionId } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const publishedWithNoClient = seedQuestions[0]!.id;
const publishedWithAClient = seedQuestions[1]!.id;
const pendingWithAClient = seedQuestions[4]!.id;

/**
 * What a caller can and cannot learn from `GET /api/questions/:id`. The query function
 * is already tested directly; what only exists here is the response — the status and the
 * bytes a refused caller actually receives (ADR-0002).
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

  // A Client hides nothing (ADR-0050): the Reviewer holds no Grant for this one's Client.
  it("hands a Viewer holding no Grant a Published Question that names a Client", async () => {
    const token = await logIn(api, seededViewer("reviewer"));

    const response = await getQuestion(api, publishedWithAClient, token);

    expect(response.status).toBe(200);
    const body = questionResponseSchema.parse(await response.json());
    expect(body.question.id).toBe(publishedWithAClient);
  });

  it("answers a Reader a Pending Question that names a Client with an unknown id's bytes", async () => {
    const token = await logIn(api, seededViewer("reader"));

    const pending = await getQuestion(api, pendingWithAClient, token);
    const unknown = await getQuestion(api, unknownQuestionId, token);

    expect(pending.status).toBe(404);
    expect(await pending.text()).toBe(await unknown.text());
  });

  it("returns a Question that names no Client to every authenticated Viewer", async () => {
    for (const role of ["reader", "author", "reviewer"] as const) {
      const token = await logIn(api, seededViewer(role));

      const response = await getQuestion(api, publishedWithNoClient, token);

      expect(response.status).toBe(200);
      const body = questionResponseSchema.parse(await response.json());
      expect(body.question.id).toBe(publishedWithNoClient);
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
    const response = await api.request(`/api/questions/${publishedWithNoClient}`);

    expect(response.status).toBe(401);
  });
});
