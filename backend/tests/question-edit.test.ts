import { apiErrorSchema, questionResponseSchema, type Question } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/features/auth/password.ts";
import { logIn, seededViewer } from "./helpers/auth.ts";
import {
  getQuestion,
  patchQuestion,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  unknownQuestionId,
  aViewer,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { writeVisibleQuestion } from "../src/features/questions/questions.repository.ts";
import { startTestApi, statusAndBody, type TestApi } from "./helpers/test-api.ts";

/** Written straight to the table, because the seed holds one Author and creating a Viewer
 * over HTTP is #25. */
async function logInAsASecondAuthor(api: TestApi): Promise<string> {
  const credentials = {
    email: "second-author@iqb.test",
    password: "second-author-password",
    role: "author" as const,
  };
  await api.database.viewer.create({
    data: {
      email: credentials.email,
      role: credentials.role,
      passwordHash: await hashPassword(credentials.password),
    },
  });
  return logIn(api, credentials);
}

/**
 * Who may change a Question, enforced by the API rather than by the interface: every
 * case here names the Question by its id and goes straight at the edit endpoint.
 *
 * The rule has two halves that have to be read together. A refusal by role answers 403,
 * which does say the Question is there — and that is only honest because the visibility
 * check has already passed. A Question that is not Visible never reaches the role rule
 * at all, and answers exactly as an id that names nothing (ADR-0002).
 */
describe("editing a Question over HTTP", () => {
  let api: TestApi;
  /** Author of every seeded Question. */
  let authorToken: string;
  /** May edit nothing. */
  let readerToken: string;
  /** Holds no Grant for the first Client, which hides nothing from them any more. */
  let reviewerToken: string;
  /** Author of nothing, holder of nothing. */
  let otherAuthorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    readerToken = await logIn(api, seededViewer("reader"));
    reviewerToken = await logIn(api, seededViewer("reviewer"));
    otherAuthorToken = await logInAsASecondAuthor(api);
  });
  // Every test here writes, so each one starts from the seeded bank again.
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const newText = "What would you change about the way this team reviews code?";
  const newAnswerNotes = "Look for a change they can describe in one sentence.";

  /** The Question as it stands, read back by the Viewer who can see it. */
  async function asItStands(id: string, token: string): Promise<Question> {
    const response = await getQuestion(api, id, token);
    if (response.status !== 200) throw new Error(`Fetching ${id} failed with ${response.status}.`);
    return questionResponseSchema.parse(await response.json()).question;
  }

  it("lets an Author change their own Question, and the change is there on the next read", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: newText, answerNotes: newAnswerNotes },
      authorToken,
    );

    expect(response.status).toBe(200);
    const answered = questionResponseSchema.parse(await response.json()).question;
    expect(answered.text).toBe(newText);
    expect(answered.answerNotes).toBe(newAnswerNotes);
    const stored = await asItStands(seededQuestionIds.aboutTypeScript, authorToken);
    expect(stored.text).toBe(newText);
    expect(stored.answerNotes).toBe(newAnswerNotes);
  });

  it("changes only the parts the request names", async () => {
    const before = await asItStands(seededQuestionIds.aboutTypeScript, authorToken);

    await patchQuestion(api, seededQuestionIds.aboutTypeScript, { text: newText }, authorToken);

    const after = await asItStands(seededQuestionIds.aboutTypeScript, authorToken);
    expect(after).toEqual({ ...before, text: newText });
  });

  it("lets an Author change their own Question while it is still Pending", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutDisagreeing,
      { text: newText },
      authorToken,
    );

    expect(response.status).toBe(200);
    const answered = questionResponseSchema.parse(await response.json()).question;
    expect(answered.publicationState).toBe("pending");
  });

  it("refuses an Author on another Author's Question, and says the Question is there", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: newText },
      otherAuthorToken,
    );

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("lets a Reviewer change another Viewer's Question", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: newText },
      reviewerToken,
    );

    expect(response.status).toBe(200);
    expect(questionResponseSchema.parse(await response.json()).question.text).toBe(newText);
  });

  it("lets a Reviewer change a Question that names a Client they hold no Grant for", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTheClientsPipeline,
      { text: newText },
      reviewerToken,
    );

    expect(response.status).toBe(200);
    expect(questionResponseSchema.parse(await response.json()).question.text).toBe(newText);
  });

  it("refuses a Reader on a Question they can see perfectly well", async () => {
    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: newText },
      readerToken,
    );

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("leaves the Question exactly as it was when the edit is refused", async () => {
    const before = await asItStands(seededQuestionIds.aboutTypeScript, authorToken);

    for (const token of [readerToken, otherAuthorToken]) {
      await patchQuestion(
        api,
        seededQuestionIds.aboutTypeScript,
        { text: newText, answerNotes: newAnswerNotes, tags: [] },
        token,
      );
    }

    expect(await asItStands(seededQuestionIds.aboutTypeScript, authorToken)).toEqual(before);
  });

  it("replaces the Tags rather than adding to them", async () => {
    const tags = [{ category: "technology", tag: "react" }];

    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { tags },
      authorToken,
    );

    expect(response.status).toBe(200);
    // The seeded Question carries four Tags across three Categories; now it carries one.
    expect(questionResponseSchema.parse(await response.json()).question.tags).toEqual(tags);
    expect((await asItStands(seededQuestionIds.aboutTypeScript, authorToken)).tags).toEqual(tags);
  });

  it("refuses an edit naming a Tag that does not exist, and writes nothing", async () => {
    const before = await asItStands(seededQuestionIds.aboutTypeScript, authorToken);

    const response = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      { text: newText, tags: [{ category: "technology", tag: "fortran" }] },
      authorToken,
    );

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    expect(await asItStands(seededQuestionIds.aboutTypeScript, authorToken)).toEqual(before);
  });

  it("refuses an edit that names nothing to change", async () => {
    const response = await patchQuestion(api, seededQuestionIds.aboutTypeScript, {}, authorToken);

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
  });

  it("refuses an edit reaching for the Publication State or the old Client field at the edge", async () => {
    const reachingFurther = [
      { publicationState: "published" },
      { clientId: null },
      { provenance: "original" },
      { authorId: unknownQuestionId },
    ];

    for (const body of reachingFurther) {
      const response = await patchQuestion(
        api,
        seededQuestionIds.aboutTypeScript,
        { text: newText, ...body },
        authorToken,
      );

      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_request");
    }
  });

  it("answers an id that is not a uuid as one that names nothing", async () => {
    const malformed = await patchQuestion(api, "not-a-uuid", { text: newText }, authorToken);
    const unknown = await patchQuestion(api, unknownQuestionId, { text: newText }, authorToken);

    expect(await statusAndBody(malformed)).toBe(await statusAndBody(unknown));
    expect(malformed.status).toBe(404);
  });
});

/** A Question the Viewer cannot see answers an edit exactly as an id that names nothing,
 * whatever role the Viewer holds (ADR-0002). */
describe("editing a Question that is not Visible", () => {
  let api: TestApi;
  let authorToken: string;
  let readerToken: string;
  /** Author of nothing, holder of nothing. */
  let otherAuthorToken: string;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
    authorToken = await logIn(api, seededViewer("author"));
    readerToken = await logIn(api, seededViewer("reader"));
    otherAuthorToken = await logInAsASecondAuthor(api);
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const edit = { text: "Rewritten by somebody who should not be able to." };

  /** What editing this id and editing an id that names nothing both look like. */
  async function editingLooksLikeNothingThere(id: string, token: string): Promise<void> {
    const hidden = await patchQuestion(api, id, edit, token);
    const nothing = await patchQuestion(api, unknownQuestionId, edit, token);

    expect(await statusAndBody(hidden)).toBe(await statusAndBody(nothing));
    expect(hidden.status).toBe(404);
  }

  it("answers a Reader editing a Pending Question as if it were not there", async () => {
    await editingLooksLikeNothingThere(seededQuestionIds.aboutDisagreeing, readerToken);
  });

  it("answers a Reader editing a Rejected Question the same way", async () => {
    await editingLooksLikeNothingThere(seededQuestionIds.aboutTwoPlusTwo, readerToken);
  });

  it("answers an Author editing another Author's Pending Question the same way", async () => {
    await editingLooksLikeNothingThere(seededQuestionIds.aboutDisagreeing, otherAuthorToken);
  });

  it("tells the two refusals apart for that same Author", async () => {
    // Published and not theirs is 403, because they can see it. Pending and not theirs is
    // 404, because they cannot — and the Publication State half of the check is what
    // makes the difference.
    const published = await patchQuestion(
      api,
      seededQuestionIds.aboutTypeScript,
      edit,
      otherAuthorToken,
    );
    const pending = await patchQuestion(
      api,
      seededQuestionIds.aboutDisagreeing,
      edit,
      otherAuthorToken,
    );

    expect(published.status).toBe(403);
    expect(pending.status).toBe(404);
  });

  it("answers a Viewer who may not edit anyway as if the Question were not there", async () => {
    // The Reader's refusal on a Visible Question is 403. On this one it is 404: the
    // visibility check runs first, so the role never gets to be the reason.
    const visible = await patchQuestion(api, seededQuestionIds.aboutTypeScript, edit, readerToken);
    const notVisible = await patchQuestion(
      api,
      seededQuestionIds.aboutDisagreeing,
      edit,
      readerToken,
    );

    expect(visible.status).toBe(403);
    expect(notVisible.status).toBe(404);
  });

  it("really is refusing something that is there and that someone else may edit", async () => {
    // Without this, both 404s above would be satisfied by a Question nobody can edit.
    const refused = await patchQuestion(
      api,
      seededQuestionIds.aboutDisagreeing,
      edit,
      otherAuthorToken,
    );
    const allowed = await patchQuestion(api, seededQuestionIds.aboutDisagreeing, edit, authorToken);

    expect(refused.status).toBe(404);
    expect(allowed.status).toBe(200);
    expect(questionResponseSchema.parse(await allowed.json()).question.text).toBe(edit.text);
  });

  it("leaves the Question untouched after the refused edit", async () => {
    await patchQuestion(api, seededQuestionIds.aboutDisagreeing, edit, otherAuthorToken);

    const stored = await getQuestion(api, seededQuestionIds.aboutDisagreeing, authorToken);
    const question = questionResponseSchema.parse(await stored.json()).question;
    expect(question.text).not.toBe(edit.text);
  });
});

/**
 * The write is scoped on its own, and the look-up that runs before it in the service is
 * not what makes it safe. Called directly, because over HTTP the two always run together.
 */
describe("the edit's own visibility check", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
    await seedTheBank(api.database);
  });
  beforeEach(async () => {
    await resetTheQuestions(api.database);
  });
  afterAll(async () => {
    await api.stop();
  });

  const rewritten = "Rewritten by a write that should never have reached this row.";

  /** Pending and the seeded Author's, so out of every other Author's sight. */
  const hidden = seededQuestionIds.aboutDisagreeing;

  const textOf = async (id: string): Promise<string> =>
    (await api.database.question.findUniqueOrThrow({ where: { id }, select: { text: true } })).text;

  it("writes nothing for an Author who did not write that Pending Question", async () => {
    const before = await textOf(hidden);
    const stranger = await aViewer(api.database, "author");

    const edited = await writeVisibleQuestion(api.database, stranger, hidden, {
      act: "edit",
      text: rewritten,
    });

    expect(edited).toEqual({ refused: "not-visible" });
    expect(await textOf(hidden)).toBe(before);
  });

  it("writes for the Author who did, so the refusal above is not a no-op", async () => {
    const author = await viewerByRole(api.database, "author");

    const edited = await writeVisibleQuestion(api.database, author, hidden, {
      act: "edit",
      text: rewritten,
    });

    expect(edited).toMatchObject({ question: { text: rewritten } });
    expect(await textOf(hidden)).toBe(rewritten);
  });

  it("leaves the Tags alone when it refuses", async () => {
    const before = await api.database.questionTag.count({ where: { questionId: hidden } });
    const stranger = await aViewer(api.database, "author");

    await writeVisibleQuestion(api.database, stranger, hidden, { act: "edit", tagIds: [] });

    expect(await api.database.questionTag.count({ where: { questionId: hidden } })).toBe(before);
  });
});
