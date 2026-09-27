import type { Viewer, ViewerRole } from "@iqb/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import {
  findOwnUnpublishedQuestions,
  findPendingQuestionsForReview,
  insertQuestion,
} from "../src/features/questions/questions.repository.ts";
import type { Database } from "../src/platform/database.ts";
import {
  aViewer,
  clientIdNamed,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** The seeded Questions these lists are about, all written by the seeded Author. */
const {
  aboutDisagreeing: pendingAndUnrestricted,
  aboutTwoPlusTwo: rejectedAndUnrestricted,
  aboutTheClientsRendering: pendingForTheFirstClient,
  aboutTheOtherClientsIntake: pendingForTheSecondClient,
} = seededQuestionIds;

const wholeFirstPage = { limit: 50, offset: 0 };

const ids = (questions: readonly { id: string }[]) => questions.map((question) => question.id);

/** A Pending Question with no Client, added the way an Author adds one. */
function addPending(database: Database, author: Viewer, text: string) {
  return insertQuestion(database, author, {
    text,
    answerNotes: "Only here to be listed.",
    provenance: "original",
    tagIds: [],
  });
}

/** Asserted against the query functions, because that is where the two checks either
 * hold together or do not (ADR-0003, ADR-0013). */
describe("the lists of Questions not yet in the bank", () => {
  const database = createTestDatabase();

  const viewer = (role: ViewerRole) => viewerByRole(database, role);

  beforeEach(async () => {
    await seedTheBank(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  describe("the Reviewer's Pending queue", () => {
    it("leaves out the Pending Questions of a Client the Reviewer holds no Grant for", async () => {
      // The seeded Reviewer holds a Grant for the second Client and none for the first.
      const reviewer = await viewer("reviewer");

      const queue = await findPendingQuestionsForReview(database, reviewer, wholeFirstPage);

      expect(ids(queue)).toEqual([pendingAndUnrestricted, pendingForTheSecondClient]);
    });

    it("holds that Client's Pending Question for a Reviewer who does hold the Grant", async () => {
      const reviewer = await aViewer(database, "reviewer", [
        await clientIdNamed(database, seedClient.name),
      ]);

      const queue = await findPendingQuestionsForReview(database, reviewer, wholeFirstPage);

      expect(ids(queue)).toEqual([pendingAndUnrestricted, pendingForTheFirstClient]);
    });

    it("holds no Published and no Rejected Question", async () => {
      const queue = await findPendingQuestionsForReview(
        database,
        await viewer("reviewer"),
        wholeFirstPage,
      );

      expect(queue.map((question) => question.publicationState)).toEqual(["pending", "pending"]);
      expect(ids(queue)).not.toContain(rejectedAndUnrestricted);
    });

    it("puts the Question that has waited longest first", async () => {
      const reviewer = await viewer("reviewer");
      const added = await addPending(database, await viewer("author"), "Just added.");

      const queue = await findPendingQuestionsForReview(database, reviewer, wholeFirstPage);

      expect(ids(queue)).toEqual([pendingAndUnrestricted, pendingForTheSecondClient, added.id]);
    });

    it("hands back the page it is asked for", async () => {
      const reviewer = await viewer("reviewer");

      const second = await findPendingQuestionsForReview(database, reviewer, {
        limit: 1,
        offset: 1,
      });

      expect(ids(second)).toEqual([pendingForTheSecondClient]);
    });
  });

  describe("an Author's own Pending and Rejected Questions", () => {
    it("holds the Author's own Pending and Rejected Questions, newest first", async () => {
      const author = await viewer("author");
      const added = await addPending(database, author, "Just added.");

      const own = await findOwnUnpublishedQuestions(database, author, wholeFirstPage);

      expect(ids(own)).toEqual([
        added.id,
        pendingForTheFirstClient,
        rejectedAndUnrestricted,
        pendingAndUnrestricted,
      ]);
    });

    it("leaves out another Author's Pending Question", async () => {
      const author = await viewer("author");
      const other = await aViewer(database, "author");
      const theirs = await addPending(database, other, "Written by somebody else.");

      const own = await findOwnUnpublishedQuestions(database, author, wholeFirstPage);
      const theirsListed = await findOwnUnpublishedQuestions(database, other, wholeFirstPage);

      expect(ids(own)).not.toContain(theirs.id);
      expect(ids(theirsListed)).toEqual([theirs.id]);
    });

    it("leaves out the Author's own Pending Question under a Client they hold no Grant for", async () => {
      // The seeded Author wrote the second Client's Pending Question but holds a Grant
      // for the first Client only.
      const own = await findOwnUnpublishedQuestions(
        database,
        await viewer("author"),
        wholeFirstPage,
      );

      expect(ids(own)).not.toContain(pendingForTheSecondClient);
    });

    it("is empty for a Reviewer who wrote nothing", async () => {
      const reviewer = await viewer("reviewer");

      const own = await findOwnUnpublishedQuestions(database, reviewer, wholeFirstPage);

      expect(own).toEqual([]);
    });
  });
});
