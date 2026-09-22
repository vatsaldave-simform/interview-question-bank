import {
  apiErrorSchema,
  nearDuplicatesFoundSchema,
  questionHistoryResponseSchema,
  questionResponseSchema,
  type ChangeEvent,
  type ChangeEventType,
} from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { logIn, seededViewer } from "./helpers/auth.js";
import {
  aQuestion,
  postQuestion,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.js";
import { startTestApi, type TestApi } from "./helpers/test-api.js";

/** A reworded copy of a Published Question in the open bank, which everybody can see. */
const nearlyTheTypeScriptOne =
  "Explain the difference between an interface and a type in TypeScript.";

/** A reworded copy of a Published Question restricted to the second Client, which the
 * Author holds no Permission Grant for. */
const nearlyTheOtherClientsBookingOne =
  "How would you move this client's Python booking service onto the shared data model?";

/** And the first Client's, which the Reviewer holds no Grant for: the mirror case. */
const nearlyTheFirstClientsPipelineOne =
  "How would you migrate this client's reporting pipeline away from nightly batch jobs?";

/**
 * What happens when a submission looks like something already in the bank: the Author is
 * told at submission time rather than a Near-Duplicate being stored quietly, and their
 * word that the match is wrong is what gets it stored (ADR-0007, ADR-0014).
 */
describe("submitting a Question that resembles one already in the bank", () => {
  let api: TestApi;
  let authorToken: string;
  let reviewerToken: string;
  let authorId: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    authorId = (await viewerByRole(api.database, "author")).id;
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  /** The events of one kind the whole bank holds, whatever Question they name. */
  function eventsOfKind(type: ChangeEventType) {
    return api.database.changeEvent.findMany({ where: { type }, orderBy: { createdAt: "asc" } });
  }

  /** The history as the API answers with it, held to the shape the client is promised. */
  async function historyOf(id: string): Promise<ChangeEvent[]> {
    const response = await api.request(`/api/questions/${id}/history`, {
      headers: { authorization: `Bearer ${authorToken}` },
    });
    return questionHistoryResponseSchema.parse(await response.json()).events;
  }

  it("refuses the submission and names what it resembles", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: nearlyTheTypeScriptOne }),
      authorToken,
    );

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("conflict");
    const found = nearDuplicatesFoundSchema.parse(body.error.details);
    expect(found.nearDuplicates.map((near) => near.questionId)).toEqual([
      seededQuestionIds.aboutTypeScript,
    ]);
    expect(found.nearDuplicates[0]!.text).toContain("TypeScript");
  });

  it("stores nothing when it refuses", async () => {
    const before = await api.database.question.count();

    await postQuestion(api, aQuestion({ text: nearlyTheTypeScriptOne }), authorToken);

    expect(await api.database.question.count()).toBe(before);
  });

  it("stores the Question once the Author confirms it is genuinely different", async () => {
    const refused = await postQuestion(
      api,
      aQuestion({ text: nearlyTheTypeScriptOne }),
      authorToken,
    );
    expect(refused.status).toBe(409);

    const resubmitted = await postQuestion(
      api,
      aQuestion({ text: nearlyTheTypeScriptOne, confirmedNotANearDuplicate: true }),
      authorToken,
    );

    expect(resubmitted.status).toBe(201);
    const stored = questionResponseSchema.parse(await resubmitted.json()).question;
    expect(stored.text).toBe(nearlyTheTypeScriptOne);
  });

  it("stands in the way of nothing that resembles nothing", async () => {
    const response = await postQuestion(api, aQuestion(), authorToken);

    expect(response.status).toBe(201);
  });

  it("never tells an Author about a restricted Question they hold no Grant for", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: nearlyTheOtherClientsBookingOne }),
      authorToken,
    );

    expect(response.status).toBe(201);
    // The 201 alone would also be what a refusal that had been mishandled looked like.
    expect(await eventsOfKind("near_duplicate_refused")).toEqual([]);
  });

  it("holds a Reviewer to the same rule, for the Client they hold no Grant for", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: nearlyTheFirstClientsPipelineOne }),
      reviewerToken,
    );

    expect(response.status).toBe(201);
  });

  it("records the refused submission, naming no Question and holding what was attempted", async () => {
    await postQuestion(
      api,
      aQuestion({ text: nearlyTheTypeScriptOne, provenance: "adapted", source: "A talk" }),
      authorToken,
    );

    const [refused, ...rest] = await eventsOfKind("near_duplicate_refused");

    expect(rest).toEqual([]);
    expect(refused?.questionId).toBeNull();
    expect(refused?.viewerId).toBe(authorId);
    expect(refused?.payload).toMatchObject({
      attempted: { text: nearlyTheTypeScriptOne, provenance: "adapted", source: "A talk" },
      nearDuplicates: [{ questionId: seededQuestionIds.aboutTypeScript }],
    });
  });

  it("records the override against the Author who made the call", async () => {
    const response = await postQuestion(
      api,
      aQuestion({ text: nearlyTheTypeScriptOne, confirmedNotANearDuplicate: true }),
      authorToken,
    );
    const stored = questionResponseSchema.parse(await response.json()).question;

    const events = await historyOf(stored.id);

    expect(events.map((event) => event.type)).toEqual<ChangeEventType[]>([
      "question_added",
      "near_duplicate_overridden",
    ]);
    const overridden = events[1]!;
    expect(overridden.viewerId).toBe(authorId);
    expect(overridden.questionId).toBe(stored.id);
    expect(overridden.payload).toMatchObject({
      nearDuplicates: [{ questionId: seededQuestionIds.aboutTypeScript }],
    });
  });

  it("never shows another Viewer the Question an override overrode", async () => {
    // The Author holds the first Client's Grant and the Reviewer does not, so this text
    // resembles a Question only one of them can read.
    const response = await postQuestion(
      api,
      aQuestion({
        text: nearlyTheFirstClientsPipelineOne,
        confirmedNotANearDuplicate: true,
      }),
      authorToken,
    );
    const stored = questionResponseSchema.parse(await response.json()).question;

    const toTheReviewer = await api.request(`/api/questions/${stored.id}/history`, {
      headers: { authorization: `Bearer ${reviewerToken}` },
    });
    const events = questionHistoryResponseSchema.parse(await toTheReviewer.json()).events;

    // The Reviewer may read this Question: it is Pending and carries no Client. What
    // they may not read is the restricted Question its Author was warned about, and the
    // event saying one existed is itself the leak (ADR-0028).
    expect(events.map((event) => event.type)).toEqual<ChangeEventType[]>(["question_added"]);
    // Not the submitted text, which is the Author's own and says "reporting pipeline"
    // too: the restricted Question itself, by the id and the wording only it has.
    expect(JSON.stringify(events)).not.toContain(seededQuestionIds.aboutTheClientsPipeline);
    expect(JSON.stringify(events)).not.toContain("off nightly batch jobs");
  });

  it("still shows the Author their own override", async () => {
    const response = await postQuestion(
      api,
      aQuestion({
        text: nearlyTheFirstClientsPipelineOne,
        confirmedNotANearDuplicate: true,
      }),
      authorToken,
    );
    const stored = questionResponseSchema.parse(await response.json()).question;

    const events = await historyOf(stored.id);

    expect(events.map((event) => event.type)).toEqual<ChangeEventType[]>([
      "question_added",
      "near_duplicate_overridden",
    ]);
  });

  it("records no override when there was no match to overrule", async () => {
    await postQuestion(api, aQuestion({ confirmedNotANearDuplicate: true }), authorToken);

    expect(await eventsOfKind("near_duplicate_overridden")).toEqual([]);
  });
});
