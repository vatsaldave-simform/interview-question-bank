import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertChangeEvent } from "../src/features/change-events/change-events.repository.ts";
import type { Database } from "../src/platform/database.ts";
import {
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/**
 * The log cannot be corrected once a row is in it (ADR-0027), so a payload that does not
 * match its type is refused before the row is written.
 */
describe("writing a Change Event", () => {
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

  it("refuses a payload that does not match its type, and writes nothing", async () => {
    const viewer = await viewerByRole(database, "reviewer");

    await expect(
      insertChangeEvent(database, viewer, {
        type: "question_rejected",
        questionId: seededQuestionIds.aboutTypeScript,
        // A rejection says why, and this says nothing.
        payload: {} as never,
      }),
    ).rejects.toThrow();

    expect(await database.changeEvent.count()).toBe(0);
  });

  it("stores the Viewer who did it, and no Question for an act that has none", async () => {
    const viewer = await viewerByRole(database, "reviewer");

    await insertChangeEvent(database, viewer, {
      type: "viewer_deactivated",
      payload: { viewer: { id: viewer.id, email: viewer.email } },
    });

    const stored = await database.changeEvent.findMany();
    expect(
      stored.map(({ type, viewerId, questionId }) => ({ type, viewerId, questionId })),
    ).toEqual([{ type: "viewer_deactivated", viewerId: viewer.id, questionId: null }]);
  });

  // Never called: the type checker is what refuses it, and this line is where it is held to that.
  void function anActWithNoQuestionNamingOne(viewer: Viewer) {
    // @ts-expect-error No Question is ever involved in an administrative act (ADR-0015).
    return insertChangeEvent(database, viewer, {
      type: "viewer_deactivated",
      questionId: seededQuestionIds.aboutTypeScript,
      payload: { viewer: { id: viewer.id, email: viewer.email } },
    });
  };
});
