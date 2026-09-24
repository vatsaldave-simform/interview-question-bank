import type { ViewerRole } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedClient } from "../src/features/clients/clients.seed.ts";
import { findVisibleQuestionById } from "../src/features/questions/questions.repository.ts";
import { seedQuestions } from "../src/features/questions/questions.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { clientIdNamed, seedTheBank, viewerByRole } from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** The seeded Questions this file reasons about, by what makes each one interesting. */
const publishedAndUnrestricted = seedQuestions[0]!.id;
const publishedAndRestricted = seedQuestions[1]!.id;
const pendingAndUnrestricted = seedQuestions[2]!.id;
const rejectedAndUnrestricted = seedQuestions[3]!.id;
const pendingAndRestricted = seedQuestions[4]!.id;

/**
 * The one function every later read builds on. Visibility is checked first and
 * Publication State second (ADR-0002, ADR-0003, ADR-0013), asserted here rather than
 * over HTTP because this is where the condition either exists or does not.
 */
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

  it("hands a Viewer holding the Permission Grant the restricted Question", async () => {
    const holder = await viewer("reader");

    const found = await findVisibleQuestionById(database, holder, publishedAndRestricted);

    expect(found?.id).toBe(publishedAndRestricted);
  });

  it("answers a Viewer holding no Grant exactly as it answers for an id that does not exist", async () => {
    const withoutGrant = await viewer("reviewer");

    const restricted = await findVisibleQuestionById(database, withoutGrant, publishedAndRestricted);
    const neverExisted = await findVisibleQuestionById(database, withoutGrant, crypto.randomUUID());

    expect(restricted).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("shows an unrestricted Question to every authenticated Viewer", async () => {
    for (const role of ["reader", "author", "reviewer"] as const) {
      const found = await findVisibleQuestionById(
        database,
        await viewer(role),
        publishedAndUnrestricted,
      );

      expect(found?.id).toBe(publishedAndUnrestricted);
    }
  });

  it("keeps the Client restriction out of reach of a Grant for a different Client", async () => {
    const other = await database.client.create({ data: { name: "Some Other Client" } });
    const stranger = await database.viewer.create({
      data: {
        email: "stranger@iqb.test",
        passwordHash: "not used by this test",
        role: "reviewer",
        permissionGrants: { create: { clientId: other.id } },
      },
      select: { id: true, email: true, role: true, isAdministrator: true },
    });

    const found = await findVisibleQuestionById(database, stranger, publishedAndRestricted);

    expect(found).toBeNull();
    expect(seedClient.name).not.toBe(other.name);
  });

  it("answers a Reader a Pending Question exactly as an id that does not exist", async () => {
    const reader = await viewer("reader");

    const pending = await findVisibleQuestionById(database, reader, pendingAndUnrestricted);
    const neverExisted = await findVisibleQuestionById(database, reader, crypto.randomUUID());

    expect(pending).toBeNull();
    expect(neverExisted).toBeNull();
  });

  it("answers a Reader a Rejected Question exactly as an id that does not exist", async () => {
    const reader = await viewer("reader");

    const rejected = await findVisibleQuestionById(database, reader, rejectedAndUnrestricted);

    expect(rejected).toBeNull();
  });

  it("hands the Author their own Pending and Rejected Questions back", async () => {
    const author = await viewer("author");

    const pending = await findVisibleQuestionById(database, author, pendingAndUnrestricted);
    const rejected = await findVisibleQuestionById(database, author, rejectedAndUnrestricted);

    expect(pending?.id).toBe(pendingAndUnrestricted);
    expect(rejected?.id).toBe(rejectedAndUnrestricted);
  });

  it("hands a Reviewer a Pending Question that is Visible to them", async () => {
    const reviewer = await viewer("reviewer");

    const found = await findVisibleQuestionById(database, reviewer, pendingAndUnrestricted);

    expect(found?.id).toBe(pendingAndUnrestricted);
  });

  // Both checks at once, which ADR-0013 says have to hold together and not merely one
  // at a time: the review role is not a way around a Permission Grant.
  it("keeps a Question that is both restricted and Pending from a Reviewer holding no Grant", async () => {
    const reviewer = await viewer("reviewer");

    const found = await findVisibleQuestionById(database, reviewer, pendingAndRestricted);
    const neverExisted = await findVisibleQuestionById(database, reviewer, crypto.randomUUID());

    expect(found).toBeNull();
    expect(neverExisted).toBeNull();
  });

  // The Author rule runs after the visibility check, never instead of it (ADR-0002). Only
  // #37 can reach this state through the API, so the row is written directly.
  it("keeps an Author's own Pending Question out of reach when its Client is not theirs", async () => {
    const author = await viewer("author");
    const elsewhere = await database.client.create({ data: { name: "A Client Nobody Holds" } });
    const own = await database.question.create({
      data: {
        text: "A Question its Author can no longer see.",
        answerNotes: "Unreachable, and deliberately so.",
        authorId: author.id,
        clientId: elsewhere.id,
        provenance: "original",
      },
      select: { id: true },
    });

    const found = await findVisibleQuestionById(database, author, own.id);

    expect(found).toBeNull();
  });

  it("hands that same Question to a Reviewer who does hold the Grant", async () => {
    const clientId = await clientIdNamed(database, seedClient.name);
    const permitted = await database.viewer.create({
      data: {
        email: "permitted-reviewer@iqb.test",
        passwordHash: "not used by this test",
        role: "reviewer",
        permissionGrants: { create: { clientId } },
      },
      select: { id: true, email: true, role: true, isAdministrator: true },
    });

    const found = await findVisibleQuestionById(database, permitted, pendingAndRestricted);

    expect(found?.id).toBe(pendingAndRestricted);
  });
});
