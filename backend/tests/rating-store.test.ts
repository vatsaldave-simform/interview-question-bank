import type { Viewer } from "@iqb/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  saveRating,
  withRatingSummaries,
} from "../src/features/ratings/ratings.repository.ts";
import type { Database } from "../src/platform/database.ts";
import {
  aViewer,
  resetTheQuestions,
  seedTheBank,
  seededQuestionIds,
  viewerByRole,
} from "./helpers/question-bank.ts";
import { createTestDatabase } from "./helpers/test-database.ts";

/** Held to the repository rather than to HTTP, because the scale and the one-per-Viewer
 * rule are the database's to keep, and no route could show that nothing checks them first. */
describe("the Rating store", () => {
  let database: Database;
  let reader: Viewer;
  let author: Viewer;
  let reviewer: Viewer;

  const rated = { id: seededQuestionIds.aboutTypeScript };
  const unrated = { id: seededQuestionIds.aboutTheOtherClientsBooking };

  beforeAll(async () => {
    database = createTestDatabase();
    await seedTheBank(database);
    reader = await viewerByRole(database, "reader");
    author = await viewerByRole(database, "author");
    reviewer = await viewerByRole(database, "reviewer");
  });
  beforeEach(async () => {
    await resetTheQuestions(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("replaces a Viewer's Rating with their next one rather than adding a second", async () => {
    await saveRating(database, reader, rated.id, 2);
    await saveRating(database, reader, rated.id, 5);

    const [summary] = await withRatingSummaries(database, reader, [rated]);

    expect(summary?.rating).toEqual({ average: 5, count: 1, mine: 5 });
  });

  it("averages every Viewer's Rating and tells each Viewer only their own", async () => {
    await saveRating(database, reader, rated.id, 2);
    await saveRating(database, reviewer, rated.id, 5);
    await saveRating(database, await aViewer(database, "author"), rated.id, 4);

    const [forReader] = await withRatingSummaries(database, reader, [rated]);
    const [forReviewer] = await withRatingSummaries(database, reviewer, [rated]);
    const [forAuthor] = await withRatingSummaries(database, author, [rated]);

    // (2 + 5 + 4) / 3.
    expect(forReader?.rating.average).toBeCloseTo(3.667, 3);
    expect(forReader?.rating).toMatchObject({ count: 3, mine: 2 });
    expect(forReviewer?.rating).toMatchObject({ count: 3, mine: 5 });
    expect(forAuthor?.rating).toMatchObject({ count: 3, mine: null });
  });

  it("gives a Question nobody has rated no average, beside one that has Ratings", async () => {
    await saveRating(database, reader, rated.id, 3);

    const summaries = await withRatingSummaries(database, reviewer, [unrated, rated]);

    expect(summaries).toEqual([
      { ...unrated, rating: { average: null, count: 0, mine: null } },
      { ...rated, rating: { average: 3, count: 1, mine: null } },
    ]);
  });

  it("answers an empty page with an empty list", async () => {
    expect(await withRatingSummaries(database, reader, [])).toEqual([]);
  });

  it("refuses a value outside 1 to 5 at the database, whatever called it", async () => {
    await expect(saveRating(database, reader, rated.id, 0)).rejects.toThrow();
    await expect(saveRating(database, reader, rated.id, 6)).rejects.toThrow();

    const [summary] = await withRatingSummaries(database, reader, [rated]);
    expect(summary?.rating.count).toBe(0);
  });
});
