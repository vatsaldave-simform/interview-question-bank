import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { logIn, logInHoldingNoGrant, seededViewer } from "./helpers/auth.ts";
import {
  getQuestion,
  getQuestions,
  idsListed,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
} from "./helpers/question-bank.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** Pending, unrestricted, written by the seeded Author, and carrying only this Tag. */
const pendingAndUnrestricted = seededQuestionIds.aboutDisagreeing;
const inThePendingQuestionOnly = "disagreed";
const tagOnThePendingQuestion = { "question-type": "behavioural" };

/** Pending, and restricted to the first Client, whose Grant its Author holds. */
const pendingForTheFirstClient = seededQuestionIds.aboutTheClientsRendering;

/** All four ways into the bank, because each is its own query and one of them could
 * let a Pending Question through while the others hold (ADR-0013). */
describe("a Pending Question outside its Author and the Reviewers", () => {
  let api: TestApi;
  /** Tokens for the Viewers the Pending Question must stay hidden from. */
  let outsiders: { reader: string; otherAuthor: string };
  /** Its own Author has to see it, or "hidden" would pass for an always-empty answer. */
  let itsAuthorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    outsiders = {
      reader: await logIn(api, seededViewer("reader")),
      otherAuthor: await logInHoldingNoGrant(api, "author"),
    };
    itsAuthorToken = await logIn(api, seededViewer("author"));
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
    expect(await idsListed(await getQuestions(api, {}, itsAuthorToken))).toContain(
      pendingAndUnrestricted,
    );
  });

  it("stays out of a Category filter on the one Tag it carries", async () => {
    for (const token of Object.values(outsiders)) {
      const filtered = await getQuestions(api, tagOnThePendingQuestion, token);

      expect(await idsListed(filtered)).not.toContain(pendingAndUnrestricted);
    }
    const forItsAuthor = await getQuestions(api, tagOnThePendingQuestion, itsAuthorToken);
    expect(await idsListed(forItsAuthor)).toContain(pendingAndUnrestricted);
  });

  it("stays out of a keyword search on a word only it holds", async () => {
    for (const token of Object.values(outsiders)) {
      const found = await getQuestions(api, { keywords: inThePendingQuestionOnly }, token);

      expect(await idsListed(found)).toEqual([]);
    }
    const forItsAuthor = await getQuestions(
      api,
      { keywords: inThePendingQuestionOnly },
      itsAuthorToken,
    );
    expect(await idsListed(forItsAuthor)).toEqual([pendingAndUnrestricted]);
  });

  it("answers a direct fetch with the same status and bytes as an id that does not exist", async () => {
    for (const token of Object.values(outsiders)) {
      const pending = await getQuestion(api, pendingAndUnrestricted, token);
      const unknown = await getQuestion(api, unknownQuestionId, token);

      expect(await statusAndBody(pending)).toBe(await statusAndBody(unknown));
    }
    expect((await getQuestion(api, pendingAndUnrestricted, itsAuthorToken)).status).toBe(200);
  });
});

// The Reviewer is the case that matters: Pending hides nothing from them, so only the
// Client restriction stands between them and this Question (ADR-0013).
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
      const token = await logInHoldingNoGrant(api, role);

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
