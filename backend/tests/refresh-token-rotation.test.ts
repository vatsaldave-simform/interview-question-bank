import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findRefreshTokenByHash } from "../src/features/auth/refresh-token.repository.ts";
import {
  hashRefreshToken,
  issueRefreshToken,
  revokeRefreshTokenFamilyOf,
  rotateRefreshToken,
  type RefreshTokenConfig,
} from "../src/features/auth/refresh-token.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { seededViewer } from "./helpers/auth.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

const config: RefreshTokenConfig = { lifetimeSeconds: 900 };

/**
 * Rotation, and the reuse that ends a family. Exercised here rather than over HTTP,
 * because a stolen token is a sequence of presentations and not a request shape.
 */
describe("rotating a refresh token", () => {
  let database: Database;
  let viewerId: string;

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
  });

  it("issues a token that expires on the configured lifetime", async () => {
    const before = Date.now();

    const issued = await issueRefreshToken(database, viewerId, { lifetimeSeconds: 60 });

    expect(issued.token).toEqual(expect.any(String));
    expect(issued.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("stores the token only as a hash, never in the clear", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);

    const rows = await database.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(issued.token);
    expect(await findRefreshTokenByHash(database, hashRefreshToken(issued.token))).not.toBeNull();
  });

  it("issues a different token every time", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    const second = await issueRefreshToken(database, viewerId, config);

    expect(first.token).not.toEqual(second.token);
  });

  it("starts each login in a family of its own", async () => {
    await issueRefreshToken(database, viewerId, config);
    await issueRefreshToken(database, viewerId, config);

    const families = new Set((await database.refreshToken.findMany()).map((row) => row.familyId));
    expect(families.size).toBe(2);
  });

  it("hands back a new token for the Viewer the old one belonged to", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);

    const result = await rotateRefreshToken(database, issued.token, config);

    expect(result).toEqual({
      rotated: true,
      viewerId,
      refreshToken: { token: expect.any(String), expiresAt: expect.any(Date) },
    });
    if (result.rotated) expect(result.refreshToken.token).not.toEqual(issued.token);
  });

  it("keeps the successor in the family it came from", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);

    await rotateRefreshToken(database, issued.token, config);

    const families = new Set((await database.refreshToken.findMany()).map((row) => row.familyId));
    expect(families.size).toBe(1);
  });

  it("retires the token it rotated, so the old one stops working", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);
    await rotateRefreshToken(database, issued.token, config);

    const again = await rotateRefreshToken(database, issued.token, config);

    expect(again).toEqual({ rotated: false, reason: "reused" });
  });

  // The whole point of the family: the token the attacker took and the token the
  // Viewer's own browser holds are siblings, and one presentation of the spent one
  // must end both.
  it("revokes the whole family when a spent token comes back", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    const rotated = await rotateRefreshToken(database, first.token, config);
    if (!rotated.rotated) throw new Error("the first rotation should have succeeded");

    await rotateRefreshToken(database, first.token, config);

    expect(await rotateRefreshToken(database, rotated.refreshToken.token, config)).toEqual({
      rotated: false,
      reason: "revoked",
    });
    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("refuses a token that was never issued", async () => {
    expect(await rotateRefreshToken(database, "not a token anyone issued", config)).toEqual({
      rotated: false,
      reason: "unknown",
    });
  });

  it("refuses an expired token without revoking the family", async () => {
    const issued = await issueRefreshToken(database, viewerId, { lifetimeSeconds: 1 });
    await database.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    expect(await rotateRefreshToken(database, issued.token, config)).toEqual({
      rotated: false,
      reason: "expired",
    });
    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt === null)).toBe(true);
  });

  it("refuses every token in a family that was revoked", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);

    await revokeRefreshTokenFamilyOf(database, issued.token);

    expect(await rotateRefreshToken(database, issued.token, config)).toEqual({
      rotated: false,
      reason: "revoked",
    });
  });

  it("revokes the family a presented token belongs to, whatever its generation", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    const rotated = await rotateRefreshToken(database, first.token, config);
    if (!rotated.rotated) throw new Error("the first rotation should have succeeded");

    await revokeRefreshTokenFamilyOf(database, rotated.refreshToken.token);

    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("says nothing and changes nothing when asked to revoke a token nobody holds", async () => {
    await issueRefreshToken(database, viewerId, config);

    await revokeRefreshTokenFamilyOf(database, "not a token anyone issued");

    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt === null)).toBe(true);
  });

  // Indistinguishable from a theft, and so answered as one: the honest Viewer loses
  // the family rather than the attacker keeping a token (ADR-0023).
  it("leaves no live token when the same token is rotated twice at once", async () => {
    const issued = await issueRefreshToken(database, viewerId, config);

    const results = await Promise.all([
      rotateRefreshToken(database, issued.token, config),
      rotateRefreshToken(database, issued.token, config),
    ]);

    expect(results.filter((result) => result.rotated).length).toBeLessThanOrEqual(1);
    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    for (const result of results) {
      if (!result.rotated) continue;
      expect(await rotateRefreshToken(database, result.refreshToken.token, config)).toEqual({
        rotated: false,
        reason: "revoked",
      });
    }
  });

  // The successor is inserted after the losing request has already revoked the family,
  // so a revocation that only marked existing rows would leave it alive (ADR-0023).
  it("refuses a successor issued into a family that was revoked underneath it", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    const second = await rotateRefreshToken(database, first.token, config);
    if (!second.rotated) throw new Error("the first rotation should have succeeded");
    // The state that interleaving leaves behind: the family revoked, and a successor
    // that the revocation passed over because it did not exist yet.
    await database.refreshToken.updateMany({
      where: { spentAt: { not: null } },
      data: { revokedAt: new Date() },
    });

    expect(await rotateRefreshToken(database, second.refreshToken.token, config)).toEqual({
      rotated: false,
      reason: "revoked",
    });
    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("treats a token that is both spent and expired as a reuse, not an expiry", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    await rotateRefreshToken(database, first.token, config);
    await database.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    expect(await rotateRefreshToken(database, first.token, config)).toEqual({
      rotated: false,
      reason: "reused",
    });
    const rows = await database.refreshToken.findMany();
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it("revokes the sibling the Viewer still holds when a spent token comes back", async () => {
    const first = await issueRefreshToken(database, viewerId, config);
    const sibling = await rotateRefreshToken(database, first.token, config);
    if (!sibling.rotated) throw new Error("the first rotation should have succeeded");

    await rotateRefreshToken(database, first.token, config);

    expect(await rotateRefreshToken(database, sibling.refreshToken.token, config)).toEqual({
      rotated: false,
      reason: "revoked",
    });
  });

});
