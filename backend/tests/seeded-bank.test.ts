import { categoryNames, publicationStates } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedClient,
  seedClients,
  seedClientsAndGrants,
  seedOtherClient,
} from "../src/features/clients/clients.seed.js";
import {
  seedCategories,
  seedQuestionBank,
  seedQuestions,
} from "../src/features/questions/questions.seed.js";
import { seedViewerAccounts, seedViewers } from "../src/features/viewers/viewers.seed.js";
import type { Database } from "../src/platform/database.js";
import { createTestDatabase, truncateAll } from "./helpers/test-database.js";

/**
 * The fixtures every later suite builds on, and the guarantee that re-running the seed
 * against a database someone has been using changes nothing.
 */
describe("the seed", () => {
  let database: Database;

  beforeAll(async () => {
    database = createTestDatabase();
    await truncateAll(database);
    await seedViewerAccounts(database);
    await seedClientsAndGrants(database);
    await seedQuestionBank(database);
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it("seeds every Category in the closed vocabulary, each carrying Tags", async () => {
    const categories = await database.category.findMany({ include: { tags: true } });

    expect(categories.map((category) => category.name).sort()).toEqual([...categoryNames].sort());
    for (const category of categories) {
      expect(category.tags.length).toBeGreaterThan(0);
    }
  });

  it("gives every seeded Tag exactly one Category", async () => {
    const tags = await database.tag.findMany({ select: { value: true, categoryId: true } });

    expect(tags.length).toBe(seedCategories.flatMap((category) => category.tags).length);
    for (const tag of tags) {
      expect(tag.categoryId).toEqual(expect.any(String));
    }
  });

  it("grants some Viewers permission for each Client and leaves others without one", async () => {
    const grants = await database.permissionGrant.findMany({
      include: { viewer: { select: { email: true } }, client: { select: { name: true } } },
    });

    for (const seeded of seedClients) {
      const held = grants.filter((grant) => grant.client.name === seeded.name);
      expect(held.map((grant) => grant.viewer.email).sort()).toEqual([...seeded.grantedTo].sort());
      expect(seeded.grantedTo.length).toBeLessThan(seedViewers.length);
    }
    expect(grants).toHaveLength(seedClients.flatMap((seeded) => seeded.grantedTo).length);
  });

  // The pair the guarantee is proved with: a Viewer holding one of them holds neither
  // the other nor nothing at all, so a search can cross the two Clients.
  it("gives the two Clients no Viewer in common and leaves neither unheld", async () => {
    const grants = await database.permissionGrant.findMany({
      include: { viewer: { select: { email: true } }, client: { select: { name: true } } },
    });
    const holdersOf = (name: string) =>
      new Set(grants.filter((grant) => grant.client.name === name).map((g) => g.viewer.email));

    const first = holdersOf(seedClient.name);
    const second = holdersOf(seedOtherClient.name);
    expect(first.size).toBeGreaterThan(0);
    expect(second.size).toBeGreaterThan(0);
    expect([...first].filter((email) => second.has(email))).toEqual([]);
  });

  it("restricts a Question to each Client and leaves some restricted to neither", async () => {
    const perClient = await database.question.groupBy({
      by: ["clientId"],
      _count: { _all: true },
    });

    const restricted = perClient.filter((group) => group.clientId !== null);
    expect(restricted).toHaveLength(seedClients.length);
    expect(perClient.some((group) => group.clientId === null)).toBe(true);
  });

  it("seeds Questions in every Publication State", async () => {
    const states = await database.question.groupBy({
      by: ["publicationState"],
      _count: { _all: true },
    });

    expect(states.map((state) => state.publicationState).sort()).toEqual(
      [...publicationStates].sort(),
    );
  });

  it("seeds a Question that is both restricted to the Client and Pending", async () => {
    const both = await database.question.findFirst({
      where: { publicationState: "pending", client: { name: seedClient.name } },
    });

    expect(both).not.toBeNull();
  });

  it("seeds a Question carrying several Tags across several Categories", async () => {
    const question = await database.question.findUniqueOrThrow({
      where: { id: seedQuestions[0]!.id },
      include: { tags: { include: { tag: true } } },
    });

    const categoriesTagged = new Set(question.tags.map((questionTag) => questionTag.tag.categoryId));
    expect(question.tags.length).toBeGreaterThan(categoriesTagged.size);
    expect(categoriesTagged.size).toBeGreaterThan(1);
  });

  it("leaves an edited row untouched when it runs again", async () => {
    const edited = await database.question.update({
      where: { id: seedQuestions[0]!.id },
      data: { text: "Edited since the seed last ran." },
      select: { id: true, text: true },
    });

    await seedClientsAndGrants(database);
    await seedQuestionBank(database);

    const after = await database.question.findUniqueOrThrow({
      where: { id: edited.id },
      select: { text: true },
    });
    expect(after.text).toBe(edited.text);
  });

  it("adds nothing when it runs again", async () => {
    const before = await Promise.all([
      database.question.count(),
      database.tag.count(),
      database.permissionGrant.count(),
    ]);

    await seedClientsAndGrants(database);
    await seedQuestionBank(database);

    expect(await Promise.all([
      database.question.count(),
      database.tag.count(),
      database.permissionGrant.count(),
    ])).toEqual(before);
  });
});
