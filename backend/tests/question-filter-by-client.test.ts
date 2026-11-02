import { randomUUID } from "node:crypto";
import {
  apiErrorSchema,
  maxQuestionPageSize,
  questionListResponseSchema,
  type QuestionResponse,
} from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  commonestClients,
  commonestTags,
  getQuestions,
  inMuchOfTheBulkBank,
  seedTheBulkBank,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const bulk = { count: 600, seed: "a-test-of-the-client-filter" };

type Question = QuestionResponse["question"];
type Params = Record<string, string | number | readonly string[]>;

/**
 * The Client filter as a caller meets it. Each answer is checked against the same request
 * without the Client, filtered here by the `clients` every Question carries, so the check
 * shares no code with the query it checks.
 */
describe("filtering the bank by Client", () => {
  let api: TestApi;
  let readerToken: string;
  let clients: string[];
  let technology: string[];

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBulkBank(api.database, bulk);
    readerToken = await logIn(api, seededViewer("reader"));
    clients = await commonestClients(api.database, 2);
    technology = (await commonestTags(api.database, "technology", 1)).values;
  });
  afterAll(async () => {
    await api.stop();
  });

  /** Every match, page by page, in the order the API gave them. */
  async function everyPage(params: Params, limit = maxQuestionPageSize): Promise<Question[]> {
    const walked: Question[] = [];
    // Bounded, so an offset the API ignored ends the test instead of looping forever.
    for (let offset = 0; offset <= bulk.count; offset += limit) {
      const response = await getQuestions(api, { ...params, limit, offset }, readerToken);
      expect(response.status).toBe(200);
      const page = questionListResponseSchema.parse(await response.json());
      walked.push(...page.questions);
      if (page.questions.length < limit) break;
    }
    return walked;
  }

  function idsOf(questions: readonly Question[]): string[] {
    return questions.map((question) => question.id);
  }

  function namingAnyOf(named: readonly string[]) {
    return (question: Question) => question.clients.some((client) => named.includes(client.id));
  }

  it("returns only the Questions naming the one Client asked for", async () => {
    const [client] = clients as [string];

    const matched = await everyPage({ client });

    const expected = (await everyPage({})).filter(namingAnyOf([client]));
    expect(matched.length).toBeGreaterThan(0);
    expect(idsOf(matched)).toEqual(idsOf(expected));
  });

  it("returns the Questions naming either of two Clients", async () => {
    const [first, second] = clients as [string, string];

    const matched = await everyPage({ client: [first, second] });

    const expected = (await everyPage({})).filter(namingAnyOf([first, second]));
    expect(idsOf(matched)).toEqual(idsOf(expected));
    expect(matched.length).toBeGreaterThan((await everyPage({ client: first })).length);
    expect(matched.length).toBeGreaterThan((await everyPage({ client: second })).length);
  });

  it("returns only the Questions matching a Client, a Category and a search together", async () => {
    const [client] = clients as [string];
    const rest = { technology, keywords: inMuchOfTheBulkBank };

    const matched = await everyPage({ ...rest, client });

    // A search is ordered by how well each Question matches, and that order is kept.
    const expected = (await everyPage(rest)).filter(namingAnyOf([client]));
    expect(matched.length).toBeGreaterThan(0);
    expect(idsOf(matched)).toEqual(idsOf(expected));
    expect(matched.length).toBeLessThan((await everyPage({ client })).length);
  });

  it("returns every match exactly once when paged through", async () => {
    const [client] = clients as [string];
    const limit = 7;

    const walked = await everyPage({ client }, limit);

    expect(walked.length).toBeGreaterThan(limit);
    expect(new Set(idsOf(walked)).size).toBe(walked.length);
    expect(idsOf(walked)).toEqual(idsOf((await everyPage({})).filter(namingAnyOf([client]))));
  });

  it.each([
    ["a Client id no Client holds", () => [randomUUID()]],
    ["a real Client beside one no Client holds", () => [clients[0]!, randomUUID()]],
    ["something that is not an id at all", () => ["northwind"]],
  ])("refuses %s as an invalid request", async (_case, named) => {
    const response = await getQuestions(api, { client: named() }, readerToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});
