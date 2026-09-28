import { categoryNames, nearDuplicateThreshold, type Viewer } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/features/auth/password.ts";
import { seedClientsAndGrants } from "../src/features/clients/clients.seed.ts";
import {
  brightwater,
  fernhill,
  harbourline,
  hostedClients,
} from "../src/features/clients/hosted-clients.seed.ts";
import { hostedBank, hostedQuestions } from "../src/features/questions/hosted-bank.seed.ts";
import {
  findPendingQuestionsForReview,
  findVisibleQuestions,
} from "../src/features/questions/questions.repository.ts";
import { seedQuestionBank } from "../src/features/questions/questions.seed.ts";
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

describe("the hosted seed's Questions", () => {
  let database: Database;

  const hostedIds = new Set(hostedQuestions.map((question) => question.id));
  const everyRow = { limit: 1000, offset: 0 };

  function hostedViewerNamed(email: string): Promise<Viewer> {
    return database.viewer.findUniqueOrThrow({
      where: { email },
      select: { id: true, email: true, role: true, isAdministrator: true, isDeactivated: true },
    });
  }

  /** The Clients of the hosted Questions a Viewer can see in the bank. */
  async function clientsSeenBy(email: string): Promise<string[]> {
    const seen = await findVisibleQuestions(database, await hostedViewerNamed(email), {
      tagsPerCategory: [],
      ...everyRow,
    });
    const names = seen
      .filter((question) => hostedIds.has(question.id) && question.client !== null)
      .map((question) => question.client!.name);
    return [...new Set(names)].sort();
  }

  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAll(database);
    await seedViewerAccounts(database);
    await seedClientsAndGrants(database);
    await seedQuestionBank(database);
    await seedHostedViewers(database, readHostedPasswords(passwordSource));
    await seedClientsAndGrants(database, hostedClients);
    await seedQuestionBank(database, hostedBank);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("writes 50 Questions, all by John", async () => {
    const stored = await database.question.findMany({
      where: { id: { in: [...hostedIds] } },
      select: { author: { select: { email: true } } },
    });

    expect(stored).toHaveLength(50);
    expect(new Set(stored.map((question) => question.author.email))).toEqual(
      new Set(["john.doe@iqb.test"]),
    );
  });

  it("uses every Category, and every hosted Tag at least once", async () => {
    const carried = await database.questionTag.findMany({
      where: { questionId: { in: [...hostedIds] } },
      select: { tag: { select: { value: true, category: { select: { name: true } } } } },
    });
    const used = new Set(carried.map(({ tag }) => `${tag.category.name}/${tag.value}`));

    for (const category of hostedBank.categories) {
      for (const tag of category.tags) expect(used).toContain(`${category.name}/${tag}`);
    }
    expect(hostedBank.categories.map((category) => category.name)).toEqual([...categoryNames]);
  });

  it("leaves 38 open to everyone and gives each Client Published and Pending Questions", async () => {
    const groups = await database.question.groupBy({
      by: ["clientId", "publicationState"],
      where: { id: { in: [...hostedIds] } },
      _count: { _all: true },
    });
    const count = async (clientName: string | null, state: string) => {
      const clientId =
        clientName === null
          ? null
          : (await database.client.findUniqueOrThrow({ where: { name: clientName } })).id;
      const group = groups.find((g) => g.clientId === clientId && g.publicationState === state);
      return group?._count._all ?? 0;
    };

    expect([await count(null, "published"), await count(null, "pending")]).toEqual([35, 3]);
    expect([await count(harbourline.name, "published"), await count(harbourline.name, "pending")])
      .toEqual([3, 1]);
    expect([await count(brightwater.name, "published"), await count(brightwater.name, "pending")])
      .toEqual([2, 2]);
    expect([await count(fernhill.name, "published"), await count(fernhill.name, "pending")])
      .toEqual([3, 1]);
  });

  it("puts every Pending hosted Question in Jane's review queue", async () => {
    const queue = await findPendingQuestionsForReview(
      database,
      await hostedViewerNamed("jane.doe@iqb.test"),
      everyRow,
    );

    const pending = hostedQuestions.filter((question) => question.publicationState === "pending");
    expect(pending).toHaveLength(7);
    const queued = new Set(queue.map((question) => question.id));
    for (const question of pending) expect(queued).toContain(question.id);
  });

  it("shows each Reader only the Clients they hold a Grant for", async () => {
    expect(await clientsSeenBy("shane.austin@iqb.test")).toEqual([harbourline.name]);
    expect(await clientsSeenBy("cody.rhodes@iqb.test")).toEqual([brightwater.name]);
    expect(await clientsSeenBy("dwayne.rook@iqb.test")).toEqual([]);
  });

  // The seed skips the check an Author meets, so without this an edit to one of these
  // could be refused as a Near-Duplicate of another.
  it("holds no two Questions that are Near-Duplicates of each other", async () => {
    const pairs = await database.$queryRaw<{ first: string; second: string }[]>`
      SELECT a.text AS first, b.text AS second
        FROM questions a
        JOIN questions b ON a.id < b.id
       WHERE similarity(a.text, b.text) >= ${nearDuplicateThreshold}
    `;

    expect(pairs).toEqual([]);
  });

  it("adds nothing when it runs again", async () => {
    const before = await Promise.all([
      database.question.count(),
      database.tag.count(),
      database.questionTag.count(),
    ]);

    await seedQuestionBank(database, hostedBank);

    expect(
      await Promise.all([
        database.question.count(),
        database.tag.count(),
        database.questionTag.count(),
      ]),
    ).toEqual(before);
  });
});
