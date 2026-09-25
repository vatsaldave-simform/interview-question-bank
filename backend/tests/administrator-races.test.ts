import type { RoleChanged, Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deactivateViewer,
  withdrawAdministrator,
} from "../src/features/administration/administration.service.ts";
import { insertChangeEvent } from "../src/features/change-events/change-events.repository.ts";
import { setRole } from "../src/features/viewers/viewers.repository.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { ConflictError } from "../src/platform/errors.ts";
import { viewerByRole } from "./helpers/question-bank.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

// Each race is run several times, because one run can happen not to interleave.
const rounds = 5;

/**
 * Two requests sent together, as the refresh-token race test does (ADR-0023). The test
 * checks the rule that must hold afterwards, not the order the two requests ran in.
 */
describe("two administrative acts at the same moment", () => {
  let database: Database;

  beforeAll(() => {
    database = createTestDatabase();
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  async function twoAdministratorsAndAReader(): Promise<{ a: Viewer; b: Viewer; reader: Viewer }> {
    await truncateAll(database);
    await seedViewerAccounts(database);
    // The seeded Reviewer is the only Administrator (viewers.seed.ts).
    const author = await viewerByRole(database, "author");
    await database.viewer.update({ where: { id: author.id }, data: { isAdministrator: true } });
    return {
      a: await viewerByRole(database, "reviewer"),
      b: await viewerByRole(database, "author"),
      reader: await viewerByRole(database, "reader"),
    };
  }

  function activeAdministrators(): Promise<number> {
    return database.viewer.count({ where: { isAdministrator: true, isDeactivated: false } });
  }

  async function untilARowLockIsWaitedOn(): Promise<void> {
    for (;;) {
      const [row] = await database.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS waiting FROM pg_locks WHERE NOT granted
      `;
      if (Number(row?.waiting ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** One act went ahead and the other got the 409, not a deadlock or any other error. */
  function expectOneRefusedWith(results: PromiseSettledResult<Viewer>[], refusal: string): void {
    const refused = results.filter((result) => result.status === "rejected");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.reason).toBeInstanceOf(ConflictError);
    expect(refused[0]?.reason).toHaveProperty("message", refusal);
  }

  it("leaves one active Administrator when A and B withdraw each other", async () => {
    for (let round = 0; round < rounds; round++) {
      const { a, b } = await twoAdministratorsAndAReader();

      const results = await Promise.allSettled([
        withdrawAdministrator(database, a, b.id),
        withdrawAdministrator(database, b, a.id),
      ]);

      expect(await activeAdministrators()).toBe(1);
      expectOneRefusedWith(results, "The last Administrator's authority cannot be withdrawn.");
    }
  });

  it("leaves one active Administrator when A and B Deactivate each other", async () => {
    for (let round = 0; round < rounds; round++) {
      const { a, b } = await twoAdministratorsAndAReader();

      const results = await Promise.allSettled([
        deactivateViewer(database, a, b.id),
        deactivateViewer(database, b, a.id),
      ]);

      expect(await activeAdministrators()).toBe(1);
      expectOneRefusedWith(results, "The last active Administrator cannot be Deactivated.");
    }
  });

  it("records one Change Event when the same Viewer is Deactivated twice", async () => {
    for (let round = 0; round < rounds; round++) {
      const { a, b, reader } = await twoAdministratorsAndAReader();

      const results = await Promise.all([
        deactivateViewer(database, a, reader.id),
        deactivateViewer(database, b, reader.id),
      ]);

      for (const deactivated of results) {
        expect(deactivated).toMatchObject({ id: reader.id, isDeactivated: true });
      }
      expect(await database.changeEvent.count({ where: { type: "viewer_deactivated" } })).toBe(1);
    }
  });

  // Held in place by hand, because this order of steps is too rare to meet by sending
  // two requests together: `changeRole` has written its target but not yet its Change Event.
  it("does not deadlock with a role change that is between its two writes", async () => {
    const { a, b } = await twoAdministratorsAndAReader();
    const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id));
    if (first === undefined || second === undefined) throw new Error("two Administrators");
    const roleWritten = Promise.withResolvers<void>();
    const goOn = Promise.withResolvers<void>();

    const roleChange = database.$transaction(async (transaction) => {
      await setRole(transaction, second.id, "reader");
      roleWritten.resolve();
      await goOn.promise;
      const payload: RoleChanged = {
        viewer: { id: second.id, email: second.email },
        role: { before: second.role, after: "reader" },
      };
      // Names the first Viewer, whose row the withdrawal has locked by now.
      await insertChangeEvent(transaction, {
        type: "role_changed",
        questionId: null,
        viewerId: first.id,
        payload,
      });
    });
    await roleWritten.promise;
    const withdrawal = withdrawAdministrator(database, first, second.id);
    await untilARowLockIsWaitedOn();
    goOn.resolve();

    const results = await Promise.allSettled([roleChange, withdrawal]);

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await activeAdministrators()).toBe(1);
  });
});
