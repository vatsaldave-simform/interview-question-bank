import type { ViewerRole } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findVisibleQuestionById } from "../src/features/questions/questions.repository.ts";
import { seedQuestions } from "../src/features/questions/questions.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
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

  // A Client hides nothing (ADR-0050), so holding no Grant at all changes nothing.
  it("hands that same Question to a Viewer who holds no Grant at all", async () => {
    const noGrants = await database.viewer.create({
      data: { email: "no-grants@iqb.test", passwordHash: "not used by this test", role: "reader" },
      select: { id: true, email: true, role: true, isAdministrator: true, isDeactivated: true },
    });

    const found = await findVisibleQuestionById(database, noGrants, publishedWithAClient);

    expect(found?.id).toBe(publishedWithAClient);
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

  it("answers a Reader a Pending Question exactly as an id that does not exist", async () => {
    const reader = await viewer("reader");

    const pending = await findVisibleQuestionById(database, reader, pendingWithNoClient);
    const neverExisted = await findVisibleQuestionById(database, reader, crypto.randomUUID());

    expect(pending).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("answers a Reader a Rejected Question exactly as an id that does not exist", async () => {
    const reader = await viewer("reader");

    const rejected = await findVisibleQuestionById(database, reader, rejectedWithNoClient);

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

  it("hands a Reviewer a Pending Question that names a Client they hold no Grant for", async () => {
    const reviewer = await viewer("reviewer");

    const found = await findVisibleQuestionById(database, reviewer, pendingWithAClient);

    expect(found?.id).toBe(pendingWithAClient);
  });

  // A Client opens nothing either: the Publication State rule is all that is left.
  it("answers a Reader a Pending Question that names a Client exactly as one that does not exist", async () => {
    const reader = await viewer("reader");

    const found = await findVisibleQuestionById(database, reader, pendingWithAClient);
    const neverExisted = await findVisibleQuestionById(database, reader, crypto.randomUUID());

    expect(found).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("hands an Author their own Pending Question under a Client nobody holds a Grant for", async () => {
    const author = await viewer("author");
    const elsewhere = await database.client.create({ data: { name: "A Client Nobody Holds" } });
    const own = await database.question.create({
      data: {
        text: "A Question its Author used to lose sight of.",
        answerNotes: "Reachable again now that a Client hides nothing.",
        authorId: author.id,
        clientId: elsewhere.id,
        clients: { create: [{ clientId: elsewhere.id }] },
        provenance: "original",
      },
      select: { id: true },
    });

    const found = await findVisibleQuestionById(database, author, own.id);

    expect(found?.id).toBe(own.id);
  });
});
