import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.js";
import {
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.js";
import { createTestDatabase } from "./helpers/test-database.js";

/**
 * The table the history is kept in, and the two things about it that matter before
 * anything writes to it: it can hold an event about no Question at all (ADR-0006), and
 * nothing can go back and change what it already holds (ADR-0027).
 */
describe("the Change Event log", () => {
  let database: Database;
  let viewerId: string;

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
    viewerId = (await viewerByRole(database, "author")).id;
  });
  beforeEach(async () => {
    await resetTheQuestions(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  /** One event about the seeded TypeScript Question, for a test that then tries to
   * rewrite it. */
  async function anEvent(): Promise<string> {
    const written = await database.changeEvent.create({
      data: {
        questionId: seededQuestionIds.aboutTypeScript,
        viewerId,
        type: "question_added",
        payload: { text: "As it was written." },
      },
      select: { id: true },
    });
    return written.id;
  }

  it("records an event about a submission that stored no Question", async () => {
    const written = await database.changeEvent.create({
      data: {
        questionId: null,
        viewerId,
        type: "question_added",
        payload: { text: "Refused before anything was stored." },
      },
    });

    expect(written.questionId).toBeNull();
  });

  it("names who did it and when, without being told the time", async () => {
    const before = new Date();

    const written = await database.changeEvent.findUniqueOrThrow({ where: { id: await anEvent() } });

    expect(written.viewerId).toBe(viewerId);
    expect(written.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1_000);
  });

  it("refuses an update", async () => {
    const id = await anEvent();

    await expect(
      database.changeEvent.update({ where: { id }, data: { payload: { text: "Rewritten." } } }),
    ).rejects.toThrow(/append-only/);
  });

  it("refuses a delete", async () => {
    const id = await anEvent();

    await expect(database.changeEvent.delete({ where: { id } })).rejects.toThrow(/append-only/);
  });

  it("refuses a statement written by hand, which is the point of putting the rule here", async () => {
    const id = await anEvent();

    // Prisma is not what is refusing these; the two above would pass with a rule written
    // in TypeScript, and these would not.
    await expect(
      database.$executeRawUnsafe(`UPDATE change_events SET payload = '{}'::jsonb`),
    ).rejects.toThrow(/append-only/);
    await expect(database.$executeRawUnsafe(`DELETE FROM change_events`)).rejects.toThrow(
      /append-only/,
    );

    const stored = await database.changeEvent.findUniqueOrThrow({ where: { id } });
    expect(stored.payload).toEqual({ text: "As it was written." });
  });

  it("refuses to delete a Question an event names, so no history is cut loose", async () => {
    await anEvent();

    await expect(
      database.question.delete({ where: { id: seededQuestionIds.aboutTypeScript } }),
    ).rejects.toThrow();
  });
});
