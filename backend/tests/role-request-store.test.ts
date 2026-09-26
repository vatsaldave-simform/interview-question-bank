import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.ts";
import {
  decideRoleRequest,
  findOpenRoleRequests,
  findRoleRequestsOf,
  insertRoleRequest,
} from "../src/features/role-requests/role-requests.repository.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { viewerByRole } from "./helpers/question-bank.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

/** So two rows never share a createdAt, in a test about the order they are listed in. */
function aMomentLater(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

/** Held to the repository rather than to HTTP, because what is under test is the rule the
 * database keeps, and no route could show that nothing checks it first (ADR-0041). */
describe("the Role Request store", () => {
  let database: Database;
  let readerId: string;
  let authorId: string;

  beforeAll(() => {
    database = createTestDatabase();
  });
  beforeEach(async () => {
    await truncateAll(database);
    await seedViewerAccounts(database);
    readerId = (await viewerByRole(database, "reader")).id;
    authorId = (await viewerByRole(database, "author")).id;
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("refuses a second open Role Request for one Viewer", async () => {
    await insertRoleRequest(database, readerId, "author");

    const second = insertRoleRequest(database, readerId, "reviewer");

    await expect(second).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(second).rejects.toHaveProperty("code", "P2002");
    expect(await database.roleRequest.count()).toBe(1);
  });

  it("takes a new Role Request once the open one is denied", async () => {
    const first = await insertRoleRequest(database, readerId, "reviewer");
    await decideRoleRequest(database, first.id, { state: "denied", reason: "Not yet." });

    const second = await insertRoleRequest(database, readerId, "reviewer");

    expect(second).toMatchObject({ state: "open", reason: null, decidedAt: null });
  });

  it("takes a new Role Request once the open one is granted", async () => {
    const first = await insertRoleRequest(database, readerId, "author");
    await decideRoleRequest(database, first.id, { state: "granted", reason: null });

    const second = await insertRoleRequest(database, readerId, "reviewer");

    expect(second.state).toBe("open");
  });

  it("lets two Viewers each hold an open Role Request", async () => {
    await insertRoleRequest(database, readerId, "reviewer");
    await insertRoleRequest(database, authorId, "reviewer");

    expect(await database.roleRequest.count({ where: { state: "open" } })).toBe(2);
  });

  it("decides a Role Request only while it is open", async () => {
    const request = await insertRoleRequest(database, readerId, "author");

    const denied = await decideRoleRequest(database, request.id, {
      state: "denied",
      reason: "Not yet.",
    });
    const grantedAfter = await decideRoleRequest(database, request.id, {
      state: "granted",
      reason: null,
    });

    expect(denied).toMatchObject({ state: "denied", reason: "Not yet." });
    expect(denied?.decidedAt).toBeInstanceOf(Date);
    expect(grantedAfter).toBeNull();
  });

  it("lists a Viewer's own Role Requests newest first, and nobody else's", async () => {
    const older = await insertRoleRequest(database, readerId, "author");
    await decideRoleRequest(database, older.id, { state: "denied", reason: "Not yet." });
    await aMomentLater();
    const newer = await insertRoleRequest(database, readerId, "reviewer");
    await insertRoleRequest(database, authorId, "reviewer");

    const listed = await findRoleRequestsOf(database, readerId);

    expect(listed.map(({ id }) => id)).toEqual([newer.id, older.id]);
  });

  it("lists only the open Role Requests, oldest first", async () => {
    const decided = await insertRoleRequest(database, readerId, "author");
    await decideRoleRequest(database, decided.id, { state: "denied", reason: "Not yet." });
    const older = await insertRoleRequest(database, authorId, "reviewer");
    await aMomentLater();
    const newer = await insertRoleRequest(database, readerId, "reviewer");

    const listed = await findOpenRoleRequests(database);

    expect(listed.map(({ id }) => id)).toEqual([older.id, newer.id]);
    expect(listed[0]?.viewer).toEqual({ id: authorId, email: expect.any(String) });
  });
});
