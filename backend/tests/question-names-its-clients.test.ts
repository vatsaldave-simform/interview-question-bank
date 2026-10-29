import { questionListResponseSchema, questionResponseSchema, type Client } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient, seedOtherClient } from "../src/features/clients/clients.seed.ts";
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

describe("a Question names every Client it carries", () => {
  let api: TestApi;
  /** Holds a Grant for the first Client. */
  let authorToken: string;
  let client: Client;
  let otherClient: Client;

  beforeAll(async () => {
    api = await startTestApi({ recordSql: true });
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    client = { id: await clientIdNamed(api.database, seedClient.name), name: seedClient.name };
    otherClient = {
      id: await clientIdNamed(api.database, seedOtherClient.name),
      name: seedOtherClient.name,
    };
    // Added after the first Client and ahead of it by name, so a list in the order the rows
    // went in would come out wrong.
    expect(otherClient.name < client.name).toBe(true);
    await api.database.questionClient.create({
      data: { questionId: aboutTheClientsPipeline, clientId: otherClient.id },
    });
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

  const clientsOf = (questions: { id: string; clients: Client[] }[], id: string) =>
    questions.find((question) => question.id === id)?.clients;

  it("names them when a Question is added", async () => {
    expect((await added({ clientId: client.id })).clients).toEqual([client]);
    expect((await added({})).clients).toEqual([]);
  });

  it("names them, ordered by name, when a Question is fetched", async () => {
    const named = await getQuestion(api, aboutTheClientsPipeline, authorToken);
    const unnamed = await getQuestion(api, aboutTypeScript, authorToken);

    expect((await questionAnswered(named)).clients).toEqual([otherClient, client]);
    expect((await questionAnswered(unnamed)).clients).toEqual([]);
  });

  it("names them, ordered by name, when a Question is edited", async () => {
    const edit = { answerNotes: "Look for each Client being named, not just its id." };
    const unnamed = await added({});

    const editedNamed = await patchQuestion(api, aboutTheClientsPipeline, edit, authorToken);
    const editedUnnamed = await patchQuestion(api, unnamed.id, edit, authorToken);

    expect((await questionAnswered(editedNamed)).clients).toEqual([otherClient, client]);
    expect((await questionAnswered(editedUnnamed)).clients).toEqual([]);
  });

  it("names them, ordered by name, in the list", async () => {
    const questions = await listed({});

    expect(clientsOf(questions, aboutTheClientsPipeline)).toEqual([otherClient, client]);
    expect(clientsOf(questions, aboutTypeScript)).toEqual([]);
  });

  it("names them, ordered by name, in a keyword search", async () => {
    const named = await listed({ keywords: "pipeline" });
    const unnamed = await listed({ keywords: inOneAnswerNoteOnly });

    expect(clientsOf(named, aboutTheClientsPipeline)).toEqual([otherClient, client]);
    expect(clientsOf(unnamed, aboutTypeScript)).toEqual([]);
  });

  it("costs the same number of statements for a page of one as for a page of many", async () => {
    const statementsFor = async (limit: number) => {
      const before = api.statements().length;
      const questions = await listed({ limit });
      return { questions, sent: api.statements().length - before };
    };

    const one = await statementsFor(1);
    const many = await statementsFor(100);

    // Several Questions in the larger page, or the two counts would match for no reason.
    expect(one.questions).toHaveLength(1);
    expect(many.questions.length).toBeGreaterThan(5);
    expect(many.sent).toBe(one.sent);
  });
});
