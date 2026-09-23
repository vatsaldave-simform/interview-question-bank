import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  revokeRefreshTokenFamily,
  spendRefreshToken,
} from "../src/features/auth/refresh-token.repository.ts";
import { seedViewerAccounts, seedViewers } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";
import { seededViewer } from "./helpers/auth.ts";

/** The two writes that have to stay safe when one token is presented twice at once. */
describe("the refresh token store", () => {
  let database: Database;
  let viewerId: string;
  let familyId: string;

  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAll(database);
    await seedViewerAccounts(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  beforeEach(async () => {
    await database.refreshToken.deleteMany();
    const viewer = await database.viewer.findUniqueOrThrow({
      where: { email: seededViewer("author").email },
      select: { id: true },
    });
    viewerId = viewer.id;
    familyId = crypto.randomUUID();
  });

  async function store(
    tokenHash: string,
    overrides: { familyId?: string; expiresAt?: Date } = {},
  ): Promise<string> {
    const stored = await insertRefreshToken(database, {
      familyId: overrides.familyId ?? familyId,
      viewerId,
      tokenHash,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    });
    return stored.id;
  }

  it("finds a stored token by its hash, with what rotation needs to judge it", async () => {
    const id = await store("hash-one");

    const found = await findRefreshTokenByHash(database, "hash-one");

    expect(found).toEqual({
      id,
      familyId,
      viewerId,
      expiresAt: expect.any(Date),
      spentAt: null,
      revokedAt: null,
    });
  });

  it("does not find a token that was never stored", async () => {
    await store("hash-one");

    expect(await findRefreshTokenByHash(database, "hash-two")).toBeNull();
  });

  it("never returns the stored hash itself", async () => {
    await store("hash-one");

    const found = await findRefreshTokenByHash(database, "hash-one");

    expect(JSON.stringify(found)).not.toContain("hash-one");
  });

  it("marks a token spent, and reports that it was the caller that spent it", async () => {
    const id = await store("hash-one");

    expect(await spendRefreshToken(database, id)).toBe(true);

    const found = await findRefreshTokenByHash(database, "hash-one");
    expect(found?.spentAt).toBeInstanceOf(Date);
  });

  // Two requests arriving with the same token is the reuse this ticket is about, so the
  // second one must be able to tell that it lost rather than quietly rotating as well.
  it("refuses to spend the same token twice, leaving the first spending intact", async () => {
    const id = await store("hash-one");
    await spendRefreshToken(database, id);
    const spentAt = (await findRefreshTokenByHash(database, "hash-one"))?.spentAt;

    expect(await spendRefreshToken(database, id)).toBe(false);

    expect((await findRefreshTokenByHash(database, "hash-one"))?.spentAt).toEqual(spentAt);
  });

  it("revokes every member of a family, spent and unspent alike", async () => {
    const spent = await store("hash-one");
    await store("hash-two");
    await spendRefreshToken(database, spent);

    await revokeRefreshTokenFamily(database, familyId);

    expect((await findRefreshTokenByHash(database, "hash-one"))?.revokedAt).toBeInstanceOf(Date);
    expect((await findRefreshTokenByHash(database, "hash-two"))?.revokedAt).toBeInstanceOf(Date);
  });

  it("leaves another family alone", async () => {
    await store("hash-one");
    await store("hash-other", { familyId: crypto.randomUUID() });

    await revokeRefreshTokenFamily(database, familyId);

    expect((await findRefreshTokenByHash(database, "hash-other"))?.revokedAt).toBeNull();
  });

  it("leaves a revocation that already happened at its original moment", async () => {
    await store("hash-one");
    await revokeRefreshTokenFamily(database, familyId);
    const revokedAt = (await findRefreshTokenByHash(database, "hash-one"))?.revokedAt;

    await revokeRefreshTokenFamily(database, familyId);

    expect((await findRefreshTokenByHash(database, "hash-one"))?.revokedAt).toEqual(revokedAt);
  });
});
