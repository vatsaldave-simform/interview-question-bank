import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import {
  applyMigration,
  createTestDatabase,
  makeShadowDatabase,
  migrationNames,
} from "./helpers/test-database.ts";

/** The migration that makes the table and fills it in the same step (ADR-0050). Found by
 * name, since the timestamp changes each time the migration is made again. */
const copyMigrationSuffix = "_question_clients";

const author = "d0000000-0000-4000-8000-000000000001";
const firstClient = "c0000000-0000-4000-8000-000000000001";
const secondClient = "c0000000-0000-4000-8000-000000000002";
const forTheFirstClient = "a0000000-0000-4000-8000-000000000001";
const alsoForTheFirstClient = "a0000000-0000-4000-8000-000000000002";
const forTheSecondClient = "a0000000-0000-4000-8000-000000000003";
const forNoClient = "a0000000-0000-4000-8000-000000000004";

/**
 * The suite only ever runs this migration on an empty database, where the copy has
 * nothing to copy. So here the history stops just before it, rows go in, and then it runs.
 */
describe("copying each Question's Client into the join table", () => {
  let database: Database;
  let scratch: Client;

  beforeAll(async () => {
    database = createTestDatabase();
    scratch = new Client({ connectionString: await makeShadowDatabase(database) });
    await scratch.connect();

    const history = migrationNames();
    const theCopy = history.find((name) => name.endsWith(copyMigrationSuffix));
    if (theCopy === undefined) throw new Error(`No migration is named *${copyMigrationSuffix}.`);
    for (const name of history.slice(0, history.indexOf(theCopy))) {
      await applyMigration(scratch, name);
    }

    await scratch.query(
      `INSERT INTO viewers (id, email, role, "updatedAt") VALUES ($1, 'author@iqb.test', 'author', now())`,
      [author],
    );
    await scratch.query(`INSERT INTO clients (id, name) VALUES ($1, 'Northwind'), ($2, 'Contoso')`, [
      firstClient,
      secondClient,
    ]);
    for (const [id, clientId] of [
      [forTheFirstClient, firstClient],
      [alsoForTheFirstClient, firstClient],
      [forTheSecondClient, secondClient],
      [forNoClient, null],
    ]) {
      await scratch.query(
        `INSERT INTO questions (id, text, "answerNotes", "authorId", "clientId", provenance, "updatedAt")
         VALUES ($1, 'A question.', 'Some notes.', $2, $3, 'original', now())`,
        [id, author, clientId],
      );
    }

    await applyMigration(scratch, theCopy);
  });
  afterAll(async () => {
    await scratch.end();
    await database.$disconnect();
  });

  it("holds one row for each Question that had a Client, naming that Client", async () => {
    const { rows } = await scratch.query<{ questionId: string; clientId: string }>(
      `SELECT "questionId", "clientId" FROM question_clients ORDER BY "questionId"`,
    );

    // Nothing for the Question with no Client: no Client is no row, not a row naming nothing.
    expect(rows).toEqual([
      { questionId: forTheFirstClient, clientId: firstClient },
      { questionId: alsoForTheFirstClient, clientId: firstClient },
      { questionId: forTheSecondClient, clientId: secondClient },
    ]);
  });

  it("leaves the old column as it was, since the code running today still reads it", async () => {
    const { rows } = await scratch.query<{ id: string; clientId: string | null }>(
      `SELECT id, "clientId" FROM questions ORDER BY id`,
    );

    expect(rows).toEqual([
      { id: forTheFirstClient, clientId: firstClient },
      { id: alsoForTheFirstClient, clientId: firstClient },
      { id: forTheSecondClient, clientId: secondClient },
      { id: forNoClient, clientId: null },
    ]);
  });

  // Each clears the old column first, so the only thing left to refuse is the new key.
  it("refuses to delete a Client a Question names, rather than cascade or set null", async () => {
    await scratch.query(`UPDATE questions SET "clientId" = NULL WHERE id = $1`, [forTheSecondClient]);

    await expect(
      scratch.query(`DELETE FROM clients WHERE id = $1`, [secondClient]),
    ).rejects.toThrow(/question_clients_clientId_fkey/);
  });

  it("refuses to delete a Question that names a Client", async () => {
    await scratch.query(`UPDATE questions SET "clientId" = NULL WHERE id = $1`, [forTheSecondClient]);

    await expect(
      scratch.query(`DELETE FROM questions WHERE id = $1`, [forTheSecondClient]),
    ).rejects.toThrow(/question_clients_questionId_fkey/);
  });
});
