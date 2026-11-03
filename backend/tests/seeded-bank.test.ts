import { categoryNames, publicationStates } from "@iqb/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  seedClient,
  seedClients,
  seedClientList,
  seedOtherClient,
} from "../src/features/clients/clients.seed.ts";
import {
  seedCategories,
  seedQuestionBank,
  seedQuestions,
} from "../src/features/questions/questions.seed.ts";
import { seedViewerAccounts } from "../src/features/viewers/viewers.seed.ts";
import type { Database } from "../src/platform/database.ts";
import { createTestDatabase, truncateAll } from "./helpers/test-database.ts";

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
    await seedClientList(database);
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

  it("seeds each Client once, by name", async () => {
    const clients = await database.client.findMany({ select: { name: true } });

    expect(clients.map((client) => client.name).sort()).toEqual(
      seedClients.map((seeded) => seeded.name).sort(),
    );
  });

  it("names each Client on some Question and leaves some Questions naming none", async () => {
    const perClient = await database.questionClient.groupBy({
      by: ["clientId"],
      _count: { _all: true },
    });
    const namingNone = await database.question.count({ where: { clients: { none: {} } } });

    expect(perClient).toHaveLength(seedClients.length);
    expect(namingNone).toBeGreaterThan(0);
  });

  it("names both Clients on one Question", async () => {
    const named = await database.question.findMany({
      where: { clients: { some: {} } },
      select: { clients: { select: { client: { select: { name: true } } } } },
    });

    const several = named.filter(({ clients }) => clients.length > 1);
    expect(several).toHaveLength(1);
    const names = several[0]!.clients.map(({ client }) => client.name).sort();
    expect(names).toEqual([seedOtherClient.name, seedClient.name].sort());
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

  // So the queue and the Rejected path can be walked for either Client, not only among
  // the Questions that name none.
  it("seeds Questions in every Publication State for each Client", async () => {
    for (const seeded of seedClients) {
      const states = await database.question.groupBy({
        by: ["publicationState"],
        where: { clients: { some: { client: { name: seeded.name } } } },
        _count: { _all: true },
      });

      expect(states.map((state) => state.publicationState).sort()).toEqual(
        [...publicationStates].sort(),
      );
    }
  });

  // Without one, appointing the first Administrator is an act nobody can perform.
  it("seeds an Administrator", async () => {
    const administrators = await database.viewer.count({ where: { isAdministrator: true } });

    expect(administrators).toBeGreaterThan(0);
  });

  it("seeds a Question that both names the Client and is Pending", async () => {
    const both = await database.question.findFirst({
      where: {
        publicationState: "pending",
        clients: { some: { client: { name: seedClient.name } } },
      },
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

    await seedClientList(database);
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
      database.client.count(),
    ]);

    await seedClientList(database);
    await seedQuestionBank(database);

    expect(await Promise.all([
      database.question.count(),
      database.tag.count(),
      database.client.count(),
    ])).toEqual(before);
  });
});
