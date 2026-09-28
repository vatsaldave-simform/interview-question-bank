import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/features/auth/password.ts";
import { seedClientsAndGrants } from "../src/features/clients/clients.seed.ts";
import { hostedClients } from "../src/features/clients/hosted-clients.seed.ts";
import {
  hostedViewers,
  readHostedPasswords,
  seedHostedViewers,
} from "../src/features/viewers/hosted-viewers.seed.ts";
import { seedViewerAccounts, seedViewers } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

/** A password per hosted Viewer, each one different so a mix-up shows. */
const passwordSource: NodeJS.ProcessEnv = Object.fromEntries(
  hostedViewers.map((viewer) => [viewer.passwordVariable, `${viewer.passwordVariable}-long-enough`]),
);

describe("the hosted seed's passwords", () => {
  it("reads one password per hosted Viewer", () => {
    const passwords = readHostedPasswords(passwordSource);

    for (const viewer of hostedViewers) {
      expect(passwords.get(viewer.email)).toBe(passwordSource[viewer.passwordVariable]);
    }
  });

  it("names every variable that is missing or too short, not only the first", () => {
    const [missing, short, empty] = hostedViewers;
    const source = {
      ...passwordSource,
      [missing!.passwordVariable]: undefined,
      [short!.passwordVariable]: "too-short",
      [empty!.passwordVariable]: "",
    };

    expect(() => readHostedPasswords(source)).toThrow(
      new RegExp(
        [missing, short, empty].map((viewer) => viewer!.passwordVariable).join("[\\s\\S]*"),
      ),
    );
  });
});

describe("the hosted seed's Viewers", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAll(database);
    await seedHostedViewers(database, readHostedPasswords(passwordSource));
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("gives each hosted Viewer their role, and only Jane the Administrator authority", async () => {
    const stored = await database.viewer.findMany({
      select: { email: true, role: true, isAdministrator: true },
      orderBy: { email: "asc" },
    });

    expect(stored).toEqual(
      [
        { email: "cody.rhodes@iqb.test", role: "reader", isAdministrator: false },
        { email: "dwayne.rook@iqb.test", role: "reader", isAdministrator: false },
        { email: "jane.doe@iqb.test", role: "reviewer", isAdministrator: true },
        { email: "john.doe@iqb.test", role: "author", isAdministrator: false },
        { email: "shane.austin@iqb.test", role: "reader", isAdministrator: false },
      ],
    );
  });

  it("stores a hash of the password read for each Viewer", async () => {
    for (const viewer of hostedViewers) {
      const { passwordHash } = await database.viewer.findUniqueOrThrow({
        where: { email: viewer.email },
        select: { passwordHash: true },
      });

      expect(passwordHash).not.toBe(passwordSource[viewer.passwordVariable]);
      expect(await verifyPassword(passwordSource[viewer.passwordVariable]!, passwordHash!)).toBe(
        true,
      );
    }
  });

  it("leaves a changed role and password untouched when it runs again", async () => {
    const [first] = hostedViewers;
    await database.viewer.update({
      where: { email: first!.email },
      data: { role: "reviewer", passwordHash: "changed since the seed last ran" },
    });

    await seedHostedViewers(database, readHostedPasswords(passwordSource));

    expect(
      await database.viewer.findUniqueOrThrow({
        where: { email: first!.email },
        select: { role: true, passwordHash: true },
      }),
    ).toEqual({ role: "reviewer", passwordHash: "changed since the seed last ran" });
    expect(await database.viewer.count()).toBe(hostedViewers.length);
  });
});

describe("the hosted seed's Clients", () => {
  let database: Database;

  /** Which hosted Client each Viewer holds a Grant for, by email. */
  async function grantsHeld(): Promise<Record<string, string[]>> {
    const grants = await database.permissionGrant.findMany({
      include: { viewer: { select: { email: true } }, client: { select: { name: true } } },
      orderBy: [{ viewer: { email: "asc" } }, { client: { name: "asc" } }],
    });
    const held: Record<string, string[]> = {};
    for (const grant of grants) (held[grant.viewer.email] ??= []).push(grant.client.name);
    return held;
  }

  // The demo seed runs too, because the hosted bank sits beside it in the same database.
  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAll(database);
    await seedViewerAccounts(database);
    await seedClientsAndGrants(database);
    await seedHostedViewers(database, readHostedPasswords(passwordSource));
    await seedClientsAndGrants(database, hostedClients);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("grants John and Jane every hosted Client, and each Reader a different share", async () => {
    const held = await grantsHeld();

    const all = ["Brightwater Bank", "Fernhill Retail", "Harbourline Logistics"];
    expect(held["john.doe@iqb.test"]).toEqual(all);
    expect(held["jane.doe@iqb.test"]).toEqual(all);
    expect(held["shane.austin@iqb.test"]).toEqual(["Harbourline Logistics"]);
    expect(held["cody.rhodes@iqb.test"]).toEqual(["Brightwater Bank"]);
    expect(held["dwayne.rook@iqb.test"]).toBeUndefined();
  });

  it("gives the demo Viewers no Grant for a hosted Client", async () => {
    const held = await grantsHeld();
    const hostedNames = new Set(hostedClients.map((client) => client.name));

    for (const viewer of seedViewers) {
      expect((held[viewer.email] ?? []).filter((name) => hostedNames.has(name))).toEqual([]);
    }
  });

  it("adds nothing when it runs again", async () => {
    const before = await Promise.all([database.client.count(), database.permissionGrant.count()]);

    await seedClientsAndGrants(database, hostedClients);

    expect(
      await Promise.all([database.client.count(), database.permissionGrant.count()]),
    ).toEqual(before);
  });
});
