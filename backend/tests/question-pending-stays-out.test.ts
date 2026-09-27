import { questionListResponseSchema, type ViewerRole } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/features/auth/password.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  getQuestion,
  getQuestions,
  seedTheBank,
  unknownQuestionId,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** Pending, unrestricted, written by the seeded Author and carrying only this Tag. */
const pendingAndUnrestricted = "a0000000-0000-4000-8000-000000000003";
const inThePendingQuestionOnly = "disagreed";
const tagOnThePendingQuestion = { "question-type": "behavioural" };

/** Pending, restricted to the first Client, and written by the seeded Author, who holds
 * the Grant for it. */
const pendingForTheFirstClient = "a0000000-0000-4000-8000-000000000005";

/** A Viewer holding no Permission Grant at all, written straight to the database because
 * creating one over HTTP needs an Administrator and a set-password mail. */
async function logInAsNewViewer(api: TestApi, role: ViewerRole): Promise<string> {
  const credentials = {
    email: `new-${role}@iqb.test`,
    password: `new-${role}-password`,
    role,
  };
  await api.database.viewer.create({
    data: {
      email: credentials.email,
      role,
      passwordHash: await hashPassword(credentials.password),
    },
  });
  return logIn(api, credentials);
}

async function idsListed(response: Response): Promise<string[]> {
  expect(response.status).toBe(200);
  const body = questionListResponseSchema.parse(await response.json());
  return body.questions.map((question) => question.id);
}

/**
 * The bank itself never shows a Pending Question to anyone but its Author and Reviewers,
 * on any of the four ways to read it. Now that there is a queue beside it, this holds the
 * bank to the rule rather than trusting that nothing moved (ADR-0013).
 */
describe("a Pending Question outside its Author and the Reviewers", () => {
  let api: TestApi;
  /** Tokens for the Viewers the Pending Question must stay hidden from. */
  let outsiders: { reader: string; otherAuthor: string };
  /** The Question's own Author, who has to see it, so "hidden" is a real constraint. */
  let writerToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    outsiders = {
      reader: await logIn(api, seededViewer("reader")),
      otherAuthor: await logInAsNewViewer(api, "author"),
    };
    writerToken = await logIn(api, seededViewer("author"));
  });
  afterAll(async () => {
    await api.stop();
  });

  it("stays out of the plain list", async () => {
    for (const token of Object.values(outsiders)) {
      expect(await idsListed(await getQuestions(api, {}, token))).not.toContain(
        pendingAndUnrestricted,
      );
    }
    expect(await idsListed(await getQuestions(api, {}, writerToken))).toContain(
      pendingAndUnrestricted,
    );
  });

  it("stays out of a Category filter on the one Tag it carries", async () => {
    for (const token of Object.values(outsiders)) {
      const filtered = await getQuestions(api, tagOnThePendingQuestion, token);

      expect(await idsListed(filtered)).not.toContain(pendingAndUnrestricted);
    }
    const forTheWriter = await getQuestions(api, tagOnThePendingQuestion, writerToken);
    expect(await idsListed(forTheWriter)).toContain(pendingAndUnrestricted);
  });

  it("stays out of a keyword search on a word only it holds", async () => {
    for (const token of Object.values(outsiders)) {
      const found = await getQuestions(api, { keywords: inThePendingQuestionOnly }, token);

      expect(await idsListed(found)).toEqual([]);
    }
    const forTheWriter = await getQuestions(
      api,
      { keywords: inThePendingQuestionOnly },
      writerToken,
    );
    expect(await idsListed(forTheWriter)).toEqual([pendingAndUnrestricted]);
  });

  it("answers a direct fetch with the same status and bytes as an id that does not exist", async () => {
    for (const token of Object.values(outsiders)) {
      const pending = await getQuestion(api, pendingAndUnrestricted, token);
      const unknown = await getQuestion(api, unknownQuestionId, token);

      expect(await statusAndBody(pending)).toBe(await statusAndBody(unknown));
    }
    expect((await getQuestion(api, pendingAndUnrestricted, writerToken)).status).toBe(200);
  });
});

/**
 * The two checks at once, which ADR-0013 says have to hold together and not merely one at
 * a time. Every role is asked, the Reviewer among them: Pending alone would not hide this
 * Question from a Reviewer, so for them it is the Client restriction doing the hiding.
 */
describe("a Question both restricted and Pending, for a Viewer holding no Grant", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  for (const role of ["reader", "author", "reviewer"] as const) {
    it(`answers a ${role} exactly as it answers an id that does not exist`, async () => {
      const token = await logInAsNewViewer(api, role);

      const both = await getQuestion(api, pendingForTheFirstClient, token);
      const unknown = await getQuestion(api, unknownQuestionId, token);

      expect(both.status).toBe(404);
      expect(await statusAndBody(both)).toBe(await statusAndBody(unknown));
    });
  }

  it("hands the same Question to its Author, who holds the Grant", async () => {
    const token = await logIn(api, seededViewer("author"));

    const found = await getQuestion(api, pendingForTheFirstClient, token);

    expect(found.status).toBe(200);
  });
});
