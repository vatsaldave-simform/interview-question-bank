import { questionListResponseSchema, questionResponseSchema, type Client } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  aQuestion,
  clientIdNamed,
  getQuestion,
  getQuestions,
  inOneAnswerNoteOnly,
  patchQuestion,
  postQuestion,
  questionAnswered,
  seedTheBank,
  seededQuestionIds,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

const { aboutTypeScript, aboutTheClientsPipeline } = seededQuestionIds;

/** Every response that carries a Question names its Client, so a person can read which one. */
describe("a Question names the Client it is restricted to", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client. */
  let authorToken: string;
  let client: Client;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    client = { id: await clientIdNamed(api.database, seedClient.name), name: seedClient.name };
  });
  afterAll(async () => {
    await api.stop();
  });

  const added = async (overrides: Record<string, unknown>) => {
    // A text of its own each time, so no add is refused as a Near-Duplicate of the last.
    const text = `Which Client does question ${crypto.randomUUID()} belong to?`;
    const response = await postQuestion(api, aQuestion({ text, ...overrides }), authorToken);
    if (response.status !== 201) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return questionResponseSchema.parse(await response.json()).question;
  };

  const listed = async (params: Record<string, string | number>) => {
    const response = await getQuestions(api, { limit: 100, ...params }, authorToken);
    if (response.status !== 200) throw new Error(`Answered ${await statusAndBody(response)}.`);
    return questionListResponseSchema.parse(await response.json()).questions;
  };

  const clientOf = (questions: { id: string; client: Client | null }[], id: string) =>
    questions.find((question) => question.id === id)?.client;

  it("names it when a Question is added", async () => {
    expect((await added({ clientId: client.id })).client).toEqual(client);
    expect((await added({})).client).toBeNull();
  });

  it("names it when a Question is fetched", async () => {
    const restricted = await getQuestion(api, aboutTheClientsPipeline, authorToken);
    const unrestricted = await getQuestion(api, aboutTypeScript, authorToken);

    expect((await questionAnswered(restricted)).client).toEqual(client);
    expect((await questionAnswered(unrestricted)).client).toBeNull();
  });

  it("names it when a Question is edited", async () => {
    const edit = { answerNotes: "Look for the Client being named, not just its id." };
    const restricted = await added({ clientId: client.id });
    const unrestricted = await added({});

    const editedRestricted = await patchQuestion(api, restricted.id, edit, authorToken);
    const editedUnrestricted = await patchQuestion(api, unrestricted.id, edit, authorToken);

    expect((await questionAnswered(editedRestricted)).client).toEqual(client);
    expect((await questionAnswered(editedUnrestricted)).client).toBeNull();
  });

  it("names it in the list", async () => {
    const questions = await listed({});

    expect(clientOf(questions, aboutTheClientsPipeline)).toEqual(client);
    expect(clientOf(questions, aboutTypeScript)).toBeNull();
  });

  it("names it in a keyword search", async () => {
    const restricted = await listed({ keywords: "pipeline" });
    const unrestricted = await listed({ keywords: inOneAnswerNoteOnly });

    expect(clientOf(restricted, aboutTheClientsPipeline)).toEqual(client);
    expect(clientOf(unrestricted, aboutTypeScript)).toBeNull();
  });
});
