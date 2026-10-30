import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { writeVisibleQuestion } from "../src/features/questions/questions.repository.ts";
import {
  aViewer,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { startTestApi, type TestApi } from "./helpers/test-api.ts";

const {
  aboutTypeScript: publishedAndUnrestricted,
  aboutDisagreeing: pendingAndUnrestricted,
} = seededQuestionIds;

/**
 * Called directly, because over HTTP the service looks first and these refusals only show
 * when something changes between its look and the write. The write decides why it wrote
 * nothing inside its own transaction, so nobody has to look the Question up again.
 */
describe("why the write on an existing Question wrote nothing", () => {
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

  const eventsAbout = (id: string): Promise<number> =>
    api.database.changeEvent.count({ where: { questionId: id } });

  it("says not-visible for a Question the Viewer cannot see, and writes nothing", async () => {
    // Pending and the seeded Author's, so out of this other Author's sight.
    const stranger = await aViewer(api.database, "author");
    const before = await eventsAbout(pendingAndUnrestricted);

    const written = await writeVisibleQuestion(api.database, stranger, pendingAndUnrestricted, {
      act: "reject",
      reason: "Written by a Viewer who should never have reached this row.",
    });

    expect(written).toEqual({ refused: "not-visible" });
    const stored = await api.database.question.findUniqueOrThrow({
      where: { id: pendingAndUnrestricted },
    });
    expect(stored.publicationState).toBe("pending");
    expect(await eventsAbout(pendingAndUnrestricted)).toBe(before);
  });

  it("says wrong-state for a Question not in the state the act starts from", async () => {
    const reviewer = await viewerByRole(api.database, "reviewer");
    const before = await eventsAbout(publishedAndUnrestricted);

    const written = await writeVisibleQuestion(api.database, reviewer, publishedAndUnrestricted, {
      act: "publish",
    });

    expect(written).toEqual({ refused: "wrong-state" });
    expect(await eventsAbout(publishedAndUnrestricted)).toBe(before);
  });

  it("answers with the Question when it wrote, so the refusals above are not a no-op", async () => {
    const reviewer = await viewerByRole(api.database, "reviewer");

    const written = await writeVisibleQuestion(api.database, reviewer, pendingAndUnrestricted, {
      act: "publish",
    });

    expect(written).toMatchObject({ question: { publicationState: "published" } });
  });
});
