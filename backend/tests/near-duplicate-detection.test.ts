import { mostNearDuplicatesNamed, nearDuplicateThreshold } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findNearDuplicates } from "../src/features/questions/questions.repository.ts";
import type { Database } from "../src/platform/database.ts";
import { seedTheBank, seededQuestionIds, viewerByRole } from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** Reworded copies of seeded Questions, each well above the threshold. */
const nearlyTheTypeScriptOne =
  "Explain the difference between an interface and a type in TypeScript.";
const nearlyTheOtherClientsBookingOne =
  "How would you move this client's Python booking service onto the shared data model?";
const nearlyThePendingOne =
  "Describe a time you disagreed with a technical decision, and what you did about it.";

/** On the same subject as a seeded Question and not a copy of it, which is the case a
 * threshold too low would refuse. */
const aboutTypeScriptWithoutBeingTheSameQuestion =
  "What is structural typing, and where does TypeScript stop being structural?";

/**
 * Which Questions a submission is measured against, and which it is not. The rule is
 * Visible and Published, whoever is submitting (ADR-0007, ADR-0014).
 */
describe("finding what a submission closely resembles", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("names the Question a submission resembles, with its text and how close it is", async () => {
    const author = await viewerByRole(database, "author");

    const nearDuplicates = await findNearDuplicates(database, author, nearlyTheTypeScriptOne);

    expect(nearDuplicates.map((near) => near.questionId)).toEqual([seededQuestionIds.aboutTypeScript]);
    expect(nearDuplicates[0]!.similarity).toBeGreaterThanOrEqual(nearDuplicateThreshold);
    expect(nearDuplicates[0]!.text).toContain("TypeScript");
  });

  it("names nothing for a Question on the same subject that is not a copy of one", async () => {
    const author = await viewerByRole(database, "author");

    const nearDuplicates = await findNearDuplicates(
      database,
      author,
      aboutTypeScriptWithoutBeingTheSameQuestion,
    );

    expect(nearDuplicates).toEqual([]);
  });

  it("never names a restricted Question to a Viewer holding no Grant for its Client", async () => {
    // The Reader holds the first Client's Grant and not the second's, and the Question
    // this text copies belongs to the second.
    const reader = await viewerByRole(database, "reader");

    const nearDuplicates = await findNearDuplicates(database, reader, nearlyTheOtherClientsBookingOne);

    expect(nearDuplicates).toEqual([]);
  });

  it("names that same Question to a Viewer who does hold the Grant", async () => {
    const reviewer = await viewerByRole(database, "reviewer");

    const nearDuplicates = await findNearDuplicates(database, reviewer, nearlyTheOtherClientsBookingOne);

    expect(nearDuplicates.map((near) => near.questionId)).toEqual([
      seededQuestionIds.aboutTheOtherClientsBooking,
    ]);
  });

  it("never names a Pending Question, even to a Reviewer whose queue it is in", async () => {
    const reviewer = await viewerByRole(database, "reviewer");

    const nearDuplicates = await findNearDuplicates(database, reviewer, nearlyThePendingOne);

    expect(nearDuplicates).toEqual([]);
  });

  it("measures the Question text and not the Answer Notes (ADR-0004)", async () => {
    const author = await viewerByRole(database, "author");
    // Word for word the Answer Notes of the seeded TypeScript Question. Were the Notes
    // in the comparison, this would be the closest thing in the bank by a long way.
    const theAnswerNotesOfOne =
      "A good answer reaches declaration merging and the fact that interfaces are open, " +
      "then says which they reach for by default and why.";

    const nearDuplicates = await findNearDuplicates(database, author, theAnswerNotesOfOne);

    expect(nearDuplicates).toEqual([]);
  });

  it("has the GiST index that the closest-first ordering is answered from", async () => {
    const indexes = await database.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
       WHERE tablename = 'questions' AND indexname = 'questions_text_idx'
    `;

    expect(indexes).toHaveLength(1);
    expect(indexes[0]!.indexdef).toContain("USING gist");
    expect(indexes[0]!.indexdef).toContain("gist_trgm_ops");
  });

  // Last, because it adds Questions the tests above count on not being there.
  it("names the closest few and stops, however many the bank holds", async () => {
    const author = await viewerByRole(database, "author");
    for (let copy = 0; copy < mostNearDuplicatesNamed + 2; copy += 1) {
      await database.question.create({
        data: {
          text: `Explain the difference between a type and an interface in TypeScript. (${copy})`,
          answerNotes: "One of several copies, so that the cap has something to cut.",
          authorId: author.id,
          publicationState: "published",
          provenance: "original",
        },
      });
    }

    const nearDuplicates = await findNearDuplicates(database, author, nearlyTheTypeScriptOne);

    expect(nearDuplicates).toHaveLength(mostNearDuplicatesNamed);
  });
});
