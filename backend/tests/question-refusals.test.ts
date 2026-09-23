import { apiErrorSchema } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.ts";
import { aQuestion, postQuestion, seedTheBank } from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

/** What a submitted Question is refused for, and on which side of the edge. */
describe("refusing a Question", () => {
  let api: TestApi;
  let token: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    token = await logIn(api, seededViewer("author"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it.each([
    ["empty text", { text: "" }],
    ["text that is only whitespace", { text: "   " }],
    ["empty Answer Notes", { answerNotes: "" }],
    ["no Provenance at all", { provenance: undefined }],
    ["a Provenance outside the closed vocabulary", { provenance: "borrowed" }],
    ["a Tag naming a Category that does not exist", { tags: [{ category: "vibes", tag: "good" }] }],
    ["a Client, which classifying is not this endpoint's to do", { clientId: crypto.randomUUID() }],
  ])("refuses %s at the edge", async (_case, overrides) => {
    const response = await postQuestion(api, aQuestion(overrides), token);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  // "Before business logic runs" has one observable form, which is that nothing landed.
  it("stores nothing when it refuses", async () => {
    const before = await api.database.question.count();

    await postQuestion(api, aQuestion({ text: "" }), token);

    expect(await api.database.question.count()).toBe(before);
  });

  // Not an edge refusal: the Category is real, so only the database knows the Tag is not
  // — which is the asymmetry ADR-0024 exists to create.
  it("refuses a Tag value no Tag in that Category holds, once the database has been asked", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ tags: [{ category: "technology", tag: "cobol" }] }),
      token,
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });
});
