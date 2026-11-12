import {
  pendingQuestionListResponseSchema,
  questionListResponseSchema,
  questionResponseSchema,
  type PendingQuestionListResponse,
  type QuestionListResponse,
  type UpvoteSummary,
  type Viewer,
} from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveUpvote, withUpvoteSummaries } from "../src/features/upvotes/upvotes.repository.ts";
import { logIn, seededViewer, signInAnother } from "./helpers/auth.ts";
import {
  aQuestion,
  aViewer,
  getQuestion,
  getQuestions,
  patchQuestion,
  postQuestion,
  questionAnswered,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const {
  aboutTypeScript: published,
  aboutDisagreeing: pending,
  aboutTwoPlusTwo: rejected,
} = seededQuestionIds;

const nobodyUpvotedIt: UpvoteSummary = { count: 0, mine: false };

async function listed(response: Response): Promise<QuestionListResponse["questions"]> {
  if (response.status !== 200) throw new Error(`The list answered ${response.status}.`);
  return questionListResponseSchema.parse(await response.json()).questions;
}

async function queued(response: Response): Promise<PendingQuestionListResponse["questions"]> {
  if (response.status !== 200) throw new Error(`The queue answered ${response.status}.`);
  return pendingQuestionListResponseSchema.parse(await response.json()).questions;
}

/** Over HTTP, because the promise is about what a response holds and what it leaves out. */
describe("the Upvote summary on every Question", () => {
  let api: TestApi;
  /** An Author who added none of the seeded Questions, so has upvoted none of them. */
  let newcomer: Viewer;
  let reviewer: Viewer;
  let newcomerToken: string;
  let authorToken: string;
  let reviewerToken: string;
  /** Upvoted the TypeScript Question, and is not anyone a test signs in as. */
  let otherUpvoter: Viewer;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    ({ viewer: newcomer, token: newcomerToken } = await signInAnother(api, "author"));
    reviewer = await viewerByRole(api.database, "reviewer");
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    otherUpvoter = await aViewer(api.database, "author");

    // With the Author's from the seed, the TypeScript Question has three.
    await saveUpvote(api.database, newcomer, published);
    await saveUpvote(api.database, otherUpvoter, published);
    // A returned Question keeps the Upvotes it was given, which is how a Pending one comes to
    // carry any.
    await saveUpvote(api.database, reviewer, pending);
  });
  afterAll(async () => {
    await api.stop();
  });

  it("gives the fetched Question its count and whether the asking Viewer gave one", async () => {
    const asNewcomer = await questionAnswered(await getQuestion(api, published, newcomerToken));
    const asReviewer = await questionAnswered(await getQuestion(api, published, reviewerToken));

    expect(asNewcomer.upvotes).toEqual({ count: 3, mine: true });
    expect(asReviewer.upvotes).toEqual({ count: 3, mine: false });
  });

  it("gives every Question in the list and in a keyword search its own summary", async () => {
    const list = await listed(await getQuestions(api, {}, newcomerToken));
    const searched = await listed(
      await getQuestions(api, { keywords: "TypeScript" }, newcomerToken),
    );

    for (const questions of [list, searched]) {
      expect(questions.find((question) => question.id === published)?.upvotes).toEqual({
        count: 3,
        mine: true,
      });
    }
    // Every other Published seeded Question carries only its Author's.
    for (const question of list.filter(({ id }) => id !== published)) {
      expect(question.upvotes).toEqual({ count: 1, mine: false });
    }
  });

  it("gives the Questions in the Pending queue and in an Author's own list their summaries", async () => {
    const queue = await queued(
      await api.request("/api/questions/pending", {
        headers: { authorization: `Bearer ${reviewerToken}` },
      }),
    );
    const own = await listed(
      await api.request("/api/questions/own", {
        headers: { authorization: `Bearer ${authorToken}` },
      }),
    );

    expect(queue.find((question) => question.id === pending)?.upvotes).toEqual({
      count: 1,
      mine: true,
    });
    expect(own.find((question) => question.id === pending)?.upvotes).toEqual({
      count: 1,
      mine: false,
    });
    expect(own.find((question) => question.id === rejected)?.upvotes).toEqual(nobodyUpvotedIt);
  });

  it("gives the Question an act answers with its summary too", async () => {
    const edited = await questionAnswered(
      await patchQuestion(api, pending, { answerNotes: "Look for: they say so early." }, reviewerToken),
    );

    expect(edited.upvotes).toEqual({ count: 1, mine: true });
  });

  it("gives a new Question a summary saying nobody has upvoted it", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: "Why is an Upvote never shown attributed?" }),
      authorToken,
    );

    expect(response.status).toBe(201);
    expect(questionResponseSchema.parse(await response.json()).question.upvotes).toEqual(
      nobodyUpvotedIt,
    );
  });

  it("names no Viewer who gave an Upvote in the summary", async () => {
    const fetched = await questionAnswered(await getQuestion(api, published, newcomerToken));

    expect(JSON.stringify(fetched.upvotes)).not.toContain(otherUpvoter.id);
    expect(Object.keys(fetched.upvotes).sort()).toEqual(["count", "mine"]);
  });

  it("answers an empty page with an empty list", async () => {
    expect(await withUpvoteSummaries(api.database, newcomer, [])).toEqual([]);
  });
});
