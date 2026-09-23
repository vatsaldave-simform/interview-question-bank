import { categoryListResponseSchema, categoryNames } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedCategories } from "../src/features/questions/questions.seed.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { seedTheBank, tagOnTheOtherClientsQuestionsOnly } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

function getCategories(api: TestApi, token?: string): Promise<Response> {
  return api.request("/api/categories", {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/**
 * What a client builds its filter from. The list is the bank's vocabulary rather than
 * anything a Question owns, so it has to be the same for every Viewer (ADR-0034).
 */
describe("listing the Categories and their Tags over HTTP", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("lists every Category in the order of the closed list, with its Tags in alphabetical order", async () => {
    const token = await logIn(api, seededViewer("reader"));

    const response = await getCategories(api, token);

    expect(response.status).toBe(200);
    const body = categoryListResponseSchema.parse(await response.json());
    expect(body.categories).toEqual(
      categoryNames.map((name) => {
        const seeded = seedCategories.find((category) => category.name === name)!;
        return { name, displayName: seeded.displayName, tags: [...seeded.tags].sort() };
      }),
    );
  });

  it("answers every Viewer with the same bytes, whatever Grants they hold", async () => {
    const answers: string[] = [];
    for (const role of ["reader", "author", "reviewer"] as const) {
      const token = await logIn(api, seededViewer(role));
      const response = await getCategories(api, token);
      expect(response.status).toBe(200);
      answers.push(await response.text());
    }

    expect(new Set(answers).size).toBe(1);
  });

  // The Reader holds no Grant for the second Client. The filter already answers this Tag
  // with an empty page rather than a refusal, so listing it tells them nothing new.
  it("lists a Tag that only a Question the Viewer cannot see carries", async () => {
    const token = await logIn(api, seededViewer("reader"));

    const body = categoryListResponseSchema.parse(await (await getCategories(api, token)).json());

    const technology = body.categories.find(
      (category) => category.name === tagOnTheOtherClientsQuestionsOnly.category,
    );
    expect(technology?.tags).toContain(tagOnTheOtherClientsQuestionsOnly.tag);
  });

  it("answers a caller who is not signed in with 401", async () => {
    const response = await getCategories(api);

    expect(response.status).toBe(401);
  });
});
