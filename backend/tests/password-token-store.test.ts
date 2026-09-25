import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issuePasswordToken, spendPasswordToken } from "../src/features/auth/password-token.ts";
import {
  lockPasswordTokensOf,
  wasPasswordTokenIssuedSince,
} from "../src/features/auth/password-token.repository.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { seededViewer } from "./helpers/auth.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

const anHour = { lifetimeSeconds: 3_600 };

/** Held to the two functions rather than to HTTP, because a race and an expiry are slow
 * or unreliable to reach by following a real link. */
describe("the password token store", () => {
  let database: Database;
  let viewerId: string;
  let otherViewerId: string;

  const idOf = async (role: "author" | "reader"): Promise<string> => {
    const viewer = await database.viewer.findUniqueOrThrow({
      where: { email: seededViewer(role).email },
      select: { id: true },
    });
    return viewer.id;
  };

  beforeAll(() => {
    database = createTestDatabase();
  });
  beforeEach(async () => {
    await truncateAll(database);
    await seedViewerAccounts(database);
    viewerId = await idOf("author");
    otherViewerId = await idOf("reader");
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("spends a token once, naming the Viewer it was issued for", async () => {
    const { token } = await issuePasswordToken(database, viewerId, anHour);

    expect(await spendPasswordToken(database, token)).toBe(viewerId);
  });

  it("refuses a token the second time it is spent", async () => {
    const { token } = await issuePasswordToken(database, viewerId, anHour);
    await spendPasswordToken(database, token);

    expect(await spendPasswordToken(database, token)).toBeNull();
  });

  it("refuses a token nobody issued", async () => {
    await issuePasswordToken(database, viewerId, anHour);

    expect(await spendPasswordToken(database, "not a token anyone issued")).toBeNull();
  });

  it("refuses a token once its lifetime has passed", async () => {
    const { token } = await issuePasswordToken(database, viewerId, { lifetimeSeconds: 1 });

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    expect(await spendPasswordToken(database, token)).toBeNull();
  });

  it("says when the token stops working", async () => {
    const before = Date.now();

    const { expiresAt } = await issuePasswordToken(database, viewerId, anHour);

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });

  it("refuses a Viewer's older token once a newer one is issued", async () => {
    const { token: older } = await issuePasswordToken(database, viewerId, anHour);
    const { token: newer } = await issuePasswordToken(database, viewerId, anHour);

    expect(await spendPasswordToken(database, older)).toBeNull();
    expect(await spendPasswordToken(database, newer)).toBe(viewerId);
  });

  it("lets only one of two tokens issued at the same moment be spent", async () => {
    // Each is issued inside a transaction the other cannot see into yet, so neither ends
    // the other and both are left working, as two reset requests racing would leave them.
    let letFirstCommit = () => {};
    const firstMayCommit = new Promise<void>((resolve) => {
      letFirstCommit = resolve;
    });
    let firstIssued = () => {};
    const firstHasIssued = new Promise<void>((resolve) => {
      firstIssued = resolve;
    });
    const firstCommitted = database.$transaction(async (transaction) => {
      const issued = await issuePasswordToken(transaction, viewerId, anHour);
      firstIssued();
      await firstMayCommit;
      return issued;
    });
    await firstHasIssued;
    const second = await database.$transaction((transaction) =>
      issuePasswordToken(transaction, viewerId, anHour),
    );
    letFirstCommit();
    const first = await firstCommitted;

    const spent = [
      await spendPasswordToken(database, first.token),
      await spendPasswordToken(database, second.token),
    ];

    expect(spent.filter((result) => result === viewerId)).toHaveLength(1);
  });

  it("leaves another Viewer's token alone", async () => {
    const { token: theirs } = await issuePasswordToken(database, otherViewerId, anHour);
    const { token: mine } = await issuePasswordToken(database, viewerId, anHour);

    await spendPasswordToken(database, mine);

    expect(await spendPasswordToken(database, theirs)).toBe(otherViewerId);
  });

  it("lets only one of two spends at the same moment succeed", async () => {
    const { token } = await issuePasswordToken(database, viewerId, anHour);

    const results = await Promise.all([
      spendPasswordToken(database, token),
      spendPasswordToken(database, token),
    ]);

    expect(results.filter((result) => result === viewerId)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });

  it("says whether a Viewer was issued a token since a given moment", async () => {
    const beforeIssuing = new Date(Date.now() - 1_000);
    await issuePasswordToken(database, viewerId, anHour);
    const afterIssuing = new Date(Date.now() + 1_000);

    expect(await wasPasswordTokenIssuedSince(database, viewerId, beforeIssuing)).toBe(true);
    expect(await wasPasswordTokenIssuedSince(database, viewerId, afterIssuing)).toBe(false);
  });

  it("counts a token that has been spent", async () => {
    const since = new Date(Date.now() - 1_000);
    const { token } = await issuePasswordToken(database, viewerId, anHour);
    await spendPasswordToken(database, token);

    expect(await wasPasswordTokenIssuedSince(database, viewerId, since)).toBe(true);
  });

  it("does not count another Viewer's token", async () => {
    const since = new Date(Date.now() - 1_000);
    await issuePasswordToken(database, otherViewerId, anHour);

    expect(await wasPasswordTokenIssuedSince(database, viewerId, since)).toBe(false);
  });

  it("makes a second transaction locking the same Viewer wait for the first to end", async () => {
    let letFirstCommit = () => {};
    const firstMayCommit = new Promise<void>((resolve) => {
      letFirstCommit = resolve;
    });
    let firstLocked = () => {};
    const firstHasLocked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });
    const order: string[] = [];
    const first = database.$transaction(async (transaction) => {
      await lockPasswordTokensOf(transaction, viewerId);
      firstLocked();
      await firstMayCommit;
      order.push("first ended");
    });
    await firstHasLocked;
    const second = database.$transaction(async (transaction) => {
      await lockPasswordTokensOf(transaction, viewerId);
      order.push("second locked");
    });
    const otherViewer = database.$transaction((transaction) =>
      lockPasswordTokensOf(transaction, otherViewerId),
    );

    await otherViewer;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(order).toEqual([]);
    letFirstCommit();
    await Promise.all([first, second]);

    expect(order).toEqual(["first ended", "second locked"]);
  });
});
