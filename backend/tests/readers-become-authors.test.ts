import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/platform/database.ts";
import {
  applyMigration,
  createTestDatabase,
  makeShadowDatabase,
  migrationNames,
} from "./helpers/test-database.ts";

/** The migration that ends the Reader role (ADR-0055). Found by name, since the timestamp
 * changes each time the migration is made again. */
const readersBecomeAuthorsSuffix = "_readers_become_authors";

const reader = "e0000000-0000-4000-8000-000000000001";
const otherReader = "e0000000-0000-4000-8000-000000000002";
const author = "e0000000-0000-4000-8000-000000000003";
const reviewer = "e0000000-0000-4000-8000-000000000004";
const administrator = "e0000000-0000-4000-8000-000000000005";
const steppingDown = "e0000000-0000-4000-8000-000000000006";

const openForReader = "f0000000-0000-4000-8000-000000000001";
const openForReviewer = "f0000000-0000-4000-8000-000000000002";
const grantedReader = "f0000000-0000-4000-8000-000000000003";
const deniedReader = "f0000000-0000-4000-8000-000000000004";
const grantedAuthor = "f0000000-0000-4000-8000-000000000005";

const longAgo = "2026-01-01T00:00:00.000Z";

type ViewerRow = { id: string; role: string; isAdministrator: boolean };
type RequestRow = {
  id: string;
  role: string;
  state: string;
  reason: string | null;
  decidedAt: Date | null;
};

/**
 * The suite only ever runs this migration on an empty database, where there is no Reader
 * to change. So here the history stops just before it, rows go in, and then it runs.
 */
describe("Readers become Authors", () => {
  let database: Database;
  let scratch: Client;
  let theMigration: string;
  let ranFrom: Date;
  let ranUntil: Date;

  async function clock(): Promise<Date> {
    const { rows } = await scratch.query<{ now: Date }>(`SELECT clock_timestamp() AS now`);
    return rows[0]!.now;
  }

  async function viewers(): Promise<ViewerRow[]> {
    const { rows } = await scratch.query<ViewerRow>(
      `SELECT id, role::text, "isAdministrator" FROM viewers ORDER BY id`,
    );
    return rows;
  }

  async function requests(): Promise<RequestRow[]> {
    const { rows } = await scratch.query<RequestRow>(
      `SELECT id, role::text, state::text, reason, "decidedAt" FROM role_requests ORDER BY id`,
    );
    return rows;
  }

  beforeAll(async () => {
    database = createTestDatabase();
    scratch = new Client({ connectionString: await makeShadowDatabase(database) });
    await scratch.connect();

    const history = migrationNames();
    const found = history.find((name) => name.endsWith(readersBecomeAuthorsSuffix));
    if (found === undefined) {
      throw new Error(`No migration is named *${readersBecomeAuthorsSuffix}.`);
    }
    theMigration = found;
    for (const name of history.slice(0, history.indexOf(theMigration))) {
      await applyMigration(scratch, name);
    }

    await scratch.query(
      `INSERT INTO viewers (id, email, role, "isAdministrator", "updatedAt") VALUES
         ($1, 'reader@iqb.test', 'reader', false, $7),
         ($2, 'other.reader@iqb.test', 'reader', false, $7),
         ($3, 'author@iqb.test', 'author', false, $7),
         ($4, 'reviewer@iqb.test', 'reviewer', false, $7),
         ($5, 'administrator@iqb.test', 'author', true, $7),
         ($6, 'stepping.down@iqb.test', 'author', false, $7)`,
      [reader, otherReader, author, reviewer, administrator, steppingDown, longAgo],
    );
    await scratch.query(
      `INSERT INTO role_requests (id, "viewerId", role, state, reason, "decidedAt") VALUES
         ($1, $6, 'reader', 'open', NULL, NULL),
         ($2, $7, 'reviewer', 'open', NULL, NULL),
         ($3, $8, 'reader', 'granted', NULL, $10),
         ($4, $9, 'reader', 'denied', 'Not this month.', $10),
         ($5, $8, 'author', 'granted', NULL, $10)`,
      [
        openForReader,
        openForReviewer,
        grantedReader,
        deniedReader,
        grantedAuthor,
        steppingDown,
        reader,
        otherReader,
        author,
        longAgo,
      ],
    );

    ranFrom = await clock();
    await applyMigration(scratch, theMigration);
    ranUntil = await clock();
  });
  afterAll(async () => {
    await scratch.end();
    await database.$disconnect();
  });

  it("makes every Reader an Author, and leaves every other Viewer as they were", async () => {
    expect(await viewers()).toEqual([
      { id: reader, role: "author", isAdministrator: false },
      { id: otherReader, role: "author", isAdministrator: false },
      { id: author, role: "author", isAdministrator: false },
      { id: reviewer, role: "reviewer", isAdministrator: false },
      { id: administrator, role: "author", isAdministrator: true },
      { id: steppingDown, role: "author", isAdministrator: false },
    ]);
  });

  it("denies an open request for the Reader role, with the reason and the time it ran", async () => {
    const denied = (await requests()).find((row) => row.id === openForReader);

    expect(denied).toMatchObject({
      role: "reader",
      state: "denied",
      reason: "The Reader role no longer exists.",
    });
    expect(denied?.decidedAt?.getTime()).toBeGreaterThanOrEqual(ranFrom.getTime() - 1);
    expect(denied?.decidedAt?.getTime()).toBeLessThanOrEqual(ranUntil.getTime() + 1);
  });

  it("leaves an open request for another role open", async () => {
    expect((await requests()).find((row) => row.id === openForReviewer)).toEqual({
      id: openForReviewer,
      role: "reviewer",
      state: "open",
      reason: null,
      decidedAt: null,
    });
  });

  it("leaves every decided request as it was, the ones that asked for Reader included", async () => {
    const decided = (await requests()).filter((row) =>
      [grantedReader, deniedReader, grantedAuthor].includes(row.id),
    );

    expect(decided).toEqual([
      {
        id: grantedReader,
        role: "reader",
        state: "granted",
        reason: null,
        decidedAt: new Date(longAgo),
      },
      {
        id: deniedReader,
        role: "reader",
        state: "denied",
        reason: "Not this month.",
        decidedAt: new Date(longAgo),
      },
      {
        id: grantedAuthor,
        role: "author",
        state: "granted",
        reason: null,
        decidedAt: new Date(longAgo),
      },
    ]);
  });

  it("writes no Change Event, because a migration is not a Viewer", async () => {
    const { rows } = await scratch.query(`SELECT id FROM change_events`);

    expect(rows).toEqual([]);
  });

  it("changes nothing when it runs a second time", async () => {
    const viewersBefore = await viewers();
    const requestsBefore = await requests();

    await applyMigration(scratch, theMigration);

    expect(await viewers()).toEqual(viewersBefore);
    expect(await requests()).toEqual(requestsBefore);
  });
});
