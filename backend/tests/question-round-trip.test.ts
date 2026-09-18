import type { CategoryName, ViewerRole } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findVisibleQuestionById,
  insertQuestion,
} from "../src/features/questions/questions.repository.js";
import type { Database } from "../src/platform/database.js";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.js";
import { createTestDatabase } from "./helpers/test-database.js";

/** What an Author writes comes back to them unchanged, and reaches nobody else yet. */
describe("adding a Question and fetching it back", () => {
  let database: Database;

  const viewer = (role: ViewerRole) => viewerByRole(database, role);

  /** The seeded Tag rows, which a caller of the repository names by id. */
  async function tagIdFor(category: CategoryName, value: string): Promise<string> {
    const tag = await database.tag.findFirstOrThrow({
      where: { value, category: { name: category } },
      select: { id: true },
    });
    return tag.id;
  }

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("enters a new Question as Pending, authored by the Viewer who added it", async () => {
    const author = await viewer("author");

    const added = await insertQuestion(database, author, {
      text: "How do you decide what belongs in a database transaction?",
      answerNotes: "Look for them reaching invariants rather than reciting ACID.",
      provenance: "original",
      tagIds: [],
    });

    expect(added.publicationState).toBe("pending");
    expect(added.authorId).toBe(author.id);
  });

  it("round-trips Provenance and Source through add and fetch", async () => {
    const author = await viewer("author");

    const added = await insertQuestion(database, author, {
      text: "Explain the trade-off between normalisation and read performance.",
      answerNotes: "A good answer names a case where they denormalised on purpose.",
      provenance: "adapted",
      source: "An internal training deck from a previous employer",
      tagIds: [],
    });
    const fetched = await findVisibleQuestionById(database, author, added.id);

    expect(fetched?.provenance).toBe("adapted");
    expect(fetched?.source).toBe("An internal training deck from a previous employer");
  });

  it("leaves Source empty on a Question that names none", async () => {
    const author = await viewer("author");

    const added = await insertQuestion(database, author, {
      text: "What does it mean for a function to be pure?",
      answerNotes: "Referential transparency, in their own words.",
      provenance: "original",
      tagIds: [],
    });

    expect((await findVisibleQuestionById(database, author, added.id))?.source).toBeNull();
  });

  it("carries several Tags within one Category and across several Categories", async () => {
    const author = await viewer("author");
    const tagIds = await Promise.all([
      tagIdFor("technology", "typescript"),
      tagIdFor("technology", "react"),
      tagIdFor("seniority", "senior"),
    ]);

    const added = await insertQuestion(database, author, {
      text: "How would you type a component that renders one of several shapes?",
      answerNotes: "Discriminated unions, and what goes wrong without them.",
      provenance: "original",
      tagIds,
    });
    const fetched = await findVisibleQuestionById(database, author, added.id);

    expect(fetched?.tags).toEqual(
      expect.arrayContaining([
        { category: "technology", tag: "typescript" },
        { category: "technology", tag: "react" },
        { category: "seniority", tag: "senior" },
      ]),
    );
    expect(fetched?.tags).toHaveLength(3);
  });

  // The publication gate applies to a Question the moment it is written: nothing
  // unvetted reaches a Reader, including something added a second ago (ADR-0013).
  it("keeps a newly added Question away from a Reader until it is Published", async () => {
    const author = await viewer("author");
    const reader = await viewer("reader");

    const added = await insertQuestion(database, author, {
      text: "Describe a deployment you would not want to repeat.",
      answerNotes: "The interesting part is what they changed afterwards.",
      provenance: "inherited",
      tagIds: [],
    });

    const toItsAuthor = await findVisibleQuestionById(database, author, added.id);
    const toAReader = await findVisibleQuestionById(database, reader, added.id);
    const neverExisted = await findVisibleQuestionById(database, reader, crypto.randomUUID());

    expect(toItsAuthor?.id).toBe(added.id);
    expect(toAReader).toBeNull();
    expect(neverExisted).toBeNull();
  });
});
