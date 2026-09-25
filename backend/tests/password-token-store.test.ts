import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issuePasswordToken, spendPasswordToken } from "../src/features/auth/password-token.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { seededViewer } from "./helpers/auth.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

const anHour = { lifetimeSeconds: 3_600 };

/** The rules a set-password link lives by, held to the two functions that issue and spend
 * one. The HTTP tests follow a real link; these pin down the edges that are slow or racy
 * to reach that way. */
describe("the password token store", () => {
  let database: Database;
  let viewerId: string;

  beforeAll(() => {
    database = createTestDatabase();
  });
  beforeEach(async () => {
    await truncateAll(database);
    await seedViewerAccounts(database);
    const viewer = await database.viewer.findUniqueOrThrow({
      where: { email: seededViewer("author").email },
      select: { id: true },
    });
    viewerId = viewer.id;
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

  it("lets only one of two spends at the same moment succeed", async () => {
    const { token } = await issuePasswordToken(database, viewerId, anHour);

    const results = await Promise.all([
      spendPasswordToken(database, token),
      spendPasswordToken(database, token),
    ]);

    expect(results.filter((result) => result === viewerId)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
  });
});
