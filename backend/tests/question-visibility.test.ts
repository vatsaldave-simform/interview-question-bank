import type { ViewerRole } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findVisibleQuestionById } from "../src/features/questions/questions.repository.ts";
import { seedQuestions } from "../src/features/questions/questions.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { aViewer, seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** The seeded Questions this file reasons about, by what makes each one interesting. */
const publishedWithNoClient = seedQuestions[0]!.id;
const publishedWithAClient = seedQuestions[1]!.id;
const pendingWithNoClient = seedQuestions[2]!.id;
const rejectedWithNoClient = seedQuestions[3]!.id;
const pendingWithAClient = seedQuestions[4]!.id;

/** Asserted on the query function rather than over HTTP, because this is where the rule
 * either exists or does not (ADR-0003, ADR-0050). */
describe("fetching a Question through the shared query function", () => {
  let database: Database;

  const viewer = (role: ViewerRole) => viewerByRole(database, role);

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("hands every Viewer a Published Question that names a Client", async () => {
    for (const role of ["reader", "author", "reviewer"] as const) {
      const found = await findVisibleQuestionById(database, await viewer(role), publishedWithAClient);

      expect(found?.id).toBe(publishedWithAClient);
    }
  });

  it("shows a Question that names no Client to every Viewer", async () => {
    for (const role of ["reader", "author", "reviewer"] as const) {
      const found = await findVisibleQuestionById(
        database,
        await viewer(role),
        publishedWithNoClient,
      );

      expect(found?.id).toBe(publishedWithNoClient);
    }
  });

  it("answers another Author a Pending Question exactly as an id that does not exist", async () => {
    const newcomer = await aViewer(database, "author");

    const pending = await findVisibleQuestionById(database, newcomer, pendingWithNoClient);
    const neverExisted = await findVisibleQuestionById(database, newcomer, crypto.randomUUID());

    expect(pending).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("answers another Author a Rejected Question exactly as an id that does not exist", async () => {
    const newcomer = await aViewer(database, "author");

    const rejected = await findVisibleQuestionById(database, newcomer, rejectedWithNoClient);

    expect(rejected).toBeNull();
  });

  it("hands the Author their own Pending and Rejected Questions back", async () => {
    const author = await viewer("author");

    const pending = await findVisibleQuestionById(database, author, pendingWithNoClient);
    const rejected = await findVisibleQuestionById(database, author, rejectedWithNoClient);

    expect(pending?.id).toBe(pendingWithNoClient);
    expect(rejected?.id).toBe(rejectedWithNoClient);
  });

  it("hands a Reviewer a Pending Question that is Visible to them", async () => {
    const reviewer = await viewer("reviewer");

    const found = await findVisibleQuestionById(database, reviewer, pendingWithNoClient);

    expect(found?.id).toBe(pendingWithNoClient);
  });

  it("hands a Reviewer a Pending Question that names a Client", async () => {
    const reviewer = await viewer("reviewer");

    const found = await findVisibleQuestionById(database, reviewer, pendingWithAClient);

    expect(found?.id).toBe(pendingWithAClient);
  });

  // A Client opens nothing either: the Publication State rule is all that is left.
  it("answers another Author a Pending Question that names a Client exactly as one that does not exist", async () => {
    const newcomer = await aViewer(database, "author");

    const found = await findVisibleQuestionById(database, newcomer, pendingWithAClient);
    const neverExisted = await findVisibleQuestionById(database, newcomer, crypto.randomUUID());

    expect(found).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("hands an Author their own Pending Question that names a Client", async () => {
    const author = await viewer("author");
    const elsewhere = await database.client.create({ data: { name: "A Client only this test names" } });
    const own = await database.question.create({
      data: {
        text: "A Question its Author used to lose sight of.",
        answerNotes: "Reachable again now that a Client hides nothing.",
        authorId: author.id,
        clients: { create: [{ clientId: elsewhere.id }] },
        provenance: "original",
      },
      select: { id: true },
    });

    const found = await findVisibleQuestionById(database, author, own.id);

    expect(found?.id).toBe(own.id);
  });
});
