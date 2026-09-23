import { apiErrorSchema, questionResponseSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  aQuestion,
  getQuestion,
  postQuestion,
  seedTheBank,
  unknownQuestionId,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** What `POST /api/questions` accepts, who may call it, and where a new Question lands. */
describe("adding a Question over HTTP", () => {
  let api: TestApi;

  /** Adds one as the seeded Author and returns it, for a test that needs one to exist. */
  async function added(token: string, body = aQuestion()) {
    const response = await postQuestion(api, body, token);
    if (response.status !== 201) throw new Error(`Adding a Question failed with ${response.status}.`);
    return questionResponseSchema.parse(await response.json()).question;
  }

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("refuses a Reader, because read-only means read-only", async () => {
    const token = await logIn(api, seededViewer("reader"));

    const response = await postQuestion(api, aQuestion(), token);

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("answers 201 with the new Question, which is Pending", async () => {
    const token = await logIn(api, seededViewer("author"));

    const response = await postQuestion(api, aQuestion(), token);

    expect(response.status).toBe(201);
    const body = questionResponseSchema.parse(await response.json());
    expect(body.question.publicationState).toBe("pending");
  });

  it("keeps that Pending Question from a Reader with the same bytes as an unknown id", async () => {
    const authorToken = await logIn(api, seededViewer("author"));
    const readerToken = await logIn(api, seededViewer("reader"));
    const question = await added(authorToken);

    const toAReader = await getQuestion(api, question.id, readerToken);
    const unknown = await getQuestion(api, unknownQuestionId, readerToken);

    expect(toAReader.status).toBe(unknown.status);
    expect(toAReader.status).toBe(404);
    expect(await toAReader.text()).toBe(await unknown.text());
  });

  it("hands the Author their own Pending Question back", async () => {
    const token = await logIn(api, seededViewer("author"));
    const question = await added(token);

    const response = await getQuestion(api, question.id, token);

    expect(response.status).toBe(200);
    expect(questionResponseSchema.parse(await response.json()).question.id).toBe(question.id);
  });

  it("round-trips Provenance and Source through add and fetch", async () => {
    const token = await logIn(api, seededViewer("author"));
    const source = "A conference talk, reworked heavily";

    const question = await added(token, aQuestion({ provenance: "adapted", source }));
    const fetched = await getQuestion(api, question.id, token);

    const body = questionResponseSchema.parse(await fetched.json());
    expect(body.question.provenance).toBe("adapted");
    expect(body.question.source).toBe(source);
  });

  it("carries several Tags within one Category and across several Categories", async () => {
    const token = await logIn(api, seededViewer("author"));
    const tags = [
      { category: "technology", tag: "typescript" },
      { category: "technology", tag: "postgres" },
      { category: "seniority", tag: "senior" },
    ];

    const question = await added(token, aQuestion({ tags }));

    expect(question.tags).toEqual(expect.arrayContaining(tags));
    expect(question.tags).toHaveLength(3);
  });

  it("lets a Reviewer add one too, since the constraint is on Readers", async () => {
    const token = await logIn(api, seededViewer("reviewer"));

    const response = await postQuestion(api, aQuestion(), token);

    expect(response.status).toBe(201);
  });
});
