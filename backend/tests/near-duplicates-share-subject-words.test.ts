import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findNearDuplicates } from "../src/features/questions/questions.repository.ts";
import type { Database } from "../src/platform/database.ts";
import {
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/**
 * Short Questions share most of their letters through words like "What is", so the letters
 * alone call different subjects alike. A Near-Duplicate must also have the same subject
 * words (ADR-0054).
 */
describe("a Near-Duplicate has the same subject words", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
  });
  beforeEach(async () => {
    await resetTheQuestions(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  async function publish(text: string): Promise<string> {
    const author = await viewerByRole(database, "author");
    const question = await database.question.create({
      data: {
        text,
        answerNotes: "Only here to be compared against.",
        authorId: author.id,
        publicationState: "published",
        provenance: "original",
      },
      select: { id: true },
    });
    return question.id;
  }

  it("names nothing for a Question that adds a subject", async () => {
    await publish("What is React?");

    expect(await findNearDuplicates(database, "What is CSR in React?")).toEqual([]);
  });

  it("names nothing for a Question that drops a subject", async () => {
    await publish("What is CSR in React?");

    expect(await findNearDuplicates(database, "What is React?")).toEqual([]);
  });

  it("names nothing for a Question that changes a subject", async () => {
    await publish("What is CSR in React?");

    expect(await findNearDuplicates(database, "What is SSR in React?")).toEqual([]);
  });

  it("names a rewording that only changes the words a Question is asked with", async () => {
    // The seeded bank already holds "Explain the difference between a type and an
    // interface in TypeScript."
    const nearDuplicates = await findNearDuplicates(
      database,
      "How does an interface differ from a type in TypeScript?",
    );

    expect(nearDuplicates.map((near) => near.questionId)).toEqual([
      seededQuestionIds.aboutTypeScript,
    ]);
  });

  // A Near-Duplicate by the definition, missed on purpose: when unsure, a miss is the
  // cheaper mistake, since a Reviewer can still catch it (ADR-0054).
  it("names nothing for a Question that names its setting, though it is the same", async () => {
    await publish("What is a closure?");

    expect(await findNearDuplicates(database, "What is a closure in JavaScript?")).toEqual([]);
  });

  it("names nothing for a Question with no subject words left", async () => {
    await publish("What is it?");

    expect(await findNearDuplicates(database, "What is it?")).toEqual([]);
  });

  it("still names a match that the closest few by letters would have hidden", async () => {
    const id = await publish("What is React?");
    // Each closer by letters than the match, and each with a subject word it lacks, so
    // the match comes fifth and taking only the closest 3 would never reach it.
    for (const closer of ["React UI", "React JS", "React DOM", "Reactor"]) {
      await publish(`What is it in ${closer}?`);
    }

    const nearDuplicates = await findNearDuplicates(database, "What is it in React?");

    expect(nearDuplicates.map((near) => near.questionId)).toEqual([id]);
  });
});
