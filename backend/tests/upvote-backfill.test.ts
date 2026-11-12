import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import {
  applyMigration,
  createTestDatabase,
  makeShadowDatabase,
  migrationNames,
} from "./helpers/test-database.ts";

/** The migration that makes the table and fills it in the same step (ADR-0053). Found by
 * name, since the timestamp changes each time the migration is made again. */
const upvotesMigrationSuffix = "_upvotes";

const firstAuthor = "d0000000-0000-4000-8000-000000000001";
const secondAuthor = "d0000000-0000-4000-8000-000000000002";
const upvoter = "d0000000-0000-4000-8000-000000000003";
const published = "a0000000-0000-4000-8000-000000000001";
const alsoPublished = "a0000000-0000-4000-8000-000000000002";
const pending = "a0000000-0000-4000-8000-000000000003";
const rejected = "a0000000-0000-4000-8000-000000000004";

/**
 * The suite only ever runs this migration on an empty database, where the backfill has
 * nothing to fill. So here the history stops just before it, rows go in, and then it runs.
 */
describe("giving every Published Question its Author's Upvote", () => {
  let database: Database;
  let scratch: Client;

  beforeAll(async () => {
    database = createTestDatabase();
    scratch = new Client({ connectionString: await makeShadowDatabase(database) });
    await scratch.connect();

    const history = migrationNames();
    const theUpvotes = history.find((name) => name.endsWith(upvotesMigrationSuffix));
    if (theUpvotes === undefined) {
      throw new Error(`No migration is named *${upvotesMigrationSuffix}.`);
    }
    for (const name of history.slice(0, history.indexOf(theUpvotes))) {
      await applyMigration(scratch, name);
    }

    await scratch.query(
      `INSERT INTO viewers (id, email, role, "updatedAt") VALUES
         ($1, 'first@iqb.test', 'author', now()),
         ($2, 'second@iqb.test', 'author', now()),
         ($3, 'upvoter@iqb.test', 'author', now())`,
      [firstAuthor, secondAuthor, upvoter],
    );
    for (const [id, authorId, state] of [
      [published, firstAuthor, "published"],
      [alsoPublished, secondAuthor, "published"],
      [pending, firstAuthor, "pending"],
      [rejected, secondAuthor, "rejected"],
    ]) {
      await scratch.query(
        `INSERT INTO questions (id, text, "answerNotes", "authorId", "publicationState", provenance, "updatedAt")
         VALUES ($1, 'A question.', 'Some notes.', $2, $3, 'original', now())`,
        [id, authorId, state],
      );
    }

    await applyMigration(scratch, theUpvotes);
  });
  afterAll(async () => {
    await scratch.end();
    await database.$disconnect();
  });

  it("gives each Published Question one Upvote, from its own Author, and nothing to the rest", async () => {
    const { rows } = await scratch.query<{ questionId: string; viewerId: string }>(
      `SELECT "questionId", "viewerId" FROM upvotes ORDER BY "questionId"`,
    );

    expect(rows).toEqual([
      { questionId: published, viewerId: firstAuthor },
      { questionId: alsoPublished, viewerId: secondAuthor },
    ]);
  });

  it("refuses a second Upvote from the same Viewer on the same Question", async () => {
    await expect(
      scratch.query(`INSERT INTO upvotes ("questionId", "viewerId") VALUES ($1, $2)`, [
        published,
        firstAuthor,
      ]),
    ).rejects.toThrow(/upvotes_pkey/);
  });

  it("refuses to delete a Question that has an Upvote, rather than cascade", async () => {
    await expect(scratch.query(`DELETE FROM questions WHERE id = $1`, [published])).rejects.toThrow(
      /upvotes_questionId_fkey/,
    );
  });

  it("refuses to delete a Viewer who gave an Upvote, rather than cascade", async () => {
    await scratch.query(`INSERT INTO upvotes ("questionId", "viewerId") VALUES ($1, $2)`, [
      published,
      upvoter,
    ]);

    await expect(scratch.query(`DELETE FROM viewers WHERE id = $1`, [upvoter])).rejects.toThrow(
      /upvotes_viewerId_fkey/,
    );
  });
});
