import type { CategoryName, Provenance, PublicationState } from "@iqb/shared";
import type { Database } from "../../platform/database.js";
import { seedClient } from "../clients/clients.seed.js";
import { seedViewerByRole } from "../viewers/viewers.seed.js";

export type SeedCategory = {
  name: CategoryName;
  displayName: string;
  tags: readonly string[];
};

export type SeedTagReference = { category: CategoryName; tag: string };

export type SeedQuestion = {
  /** Fixed, so the seed can be re-run and so a test can name the row it means. */
  id: string;
  text: string;
  answerNotes: string;
  authorEmail: string;
  /** Whether the Question is restricted to the seeded Client. */
  restricted: boolean;
  publicationState: PublicationState;
  provenance: Provenance;
  source?: string;
  tags: readonly SeedTagReference[];
};

/**
 * Every Category there is rather than a sample of them: the vocabulary is closed, so a
 * Category missing here is one no request can ever name (ADR-0024).
 */
export const seedCategories: readonly SeedCategory[] = [
  {
    name: "technology",
    displayName: "Technology",
    tags: ["typescript", "javascript", "react", "node", "postgres"],
  },
  { name: "seniority", displayName: "Seniority", tags: ["junior", "mid", "senior"] },
  {
    name: "question-type",
    displayName: "Question type",
    tags: ["conceptual", "practical", "behavioural", "system-design"],
  },
];

const seedAuthorEmail = seedViewerByRole("author").email;

/**
 * Questions in every Publication State, restricted and unrestricted, so that both gates
 * — and the two of them in combination — are exercisable from the first run.
 */
export const seedQuestions: readonly SeedQuestion[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    text: "Explain the difference between a type and an interface in TypeScript.",
    answerNotes:
      "A good answer reaches declaration merging and the fact that interfaces are open, " +
      "then says which they reach for by default and why.",
    authorEmail: seedAuthorEmail,
    restricted: false,
    publicationState: "published",
    provenance: "original",
    tags: [
      { category: "technology", tag: "typescript" },
      { category: "technology", tag: "node" },
      { category: "seniority", tag: "mid" },
      { category: "question-type", tag: "conceptual" },
    ],
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    text: "How would you migrate this client's reporting pipeline off nightly batch jobs?",
    answerNotes: "Look for staged cutover, backfill and a way to compare the two outputs.",
    authorEmail: seedAuthorEmail,
    restricted: true,
    publicationState: "published",
    provenance: "adapted",
    source: "Designing Data-Intensive Applications, chapter 11",
    tags: [
      { category: "technology", tag: "postgres" },
      { category: "seniority", tag: "senior" },
      { category: "question-type", tag: "system-design" },
    ],
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    text: "Describe a time you disagreed with a technical decision and what you did about it.",
    answerNotes: "The interesting part is what they did once the decision went against them.",
    authorEmail: seedAuthorEmail,
    restricted: false,
    publicationState: "pending",
    provenance: "inherited",
    tags: [{ category: "question-type", tag: "behavioural" }],
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    text: "What is 2 + 2?",
    answerNotes: "None worth recording.",
    authorEmail: seedAuthorEmail,
    restricted: false,
    publicationState: "rejected",
    provenance: "original",
    tags: [{ category: "seniority", tag: "junior" }],
  },
  {
    id: "a0000000-0000-4000-8000-000000000005",
    text: "Walk through the trade-offs in this client's current React rendering strategy.",
    answerNotes: "Expect them to ask what the measured problem is before answering.",
    authorEmail: seedAuthorEmail,
    restricted: true,
    publicationState: "pending",
    provenance: "original",
    tags: [
      { category: "technology", tag: "react" },
      { category: "question-type", tag: "practical" },
    ],
  },
];

/** How a Tag is looked up while seeding, since its id is not known until it is written. */
const tagKey = ({ category, tag }: SeedTagReference): string => `${category}/${tag}`;

/**
 * Writes the questions table directly rather than through its repository, which is not
 * the second read path ADR-0003 warns of: this runs as a command, with no Viewer to
 * scope by and nothing to answer.
 *
 * Idempotent, and deliberately leaves an existing row untouched: re-running the seed
 * against a database someone has been using must not undo their edits. The Questions
 * carry fixed ids for the same reason — there is no other key to recognise them by.
 */
export async function seedQuestionBank(database: Database): Promise<void> {
  const tagIds = await seedCategoriesAndTags(database);

  // Seeded by `clients.seed.ts`, which the seed command runs first.
  const client = await database.client.findUniqueOrThrow({
    where: { name: seedClient.name },
    select: { id: true },
  });

  for (const question of seedQuestions) {
    const author = await database.viewer.findUniqueOrThrow({
      where: { email: question.authorEmail },
      select: { id: true },
    });
    await database.question.upsert({
      where: { id: question.id },
      update: {},
      create: {
        id: question.id,
        text: question.text,
        answerNotes: question.answerNotes,
        authorId: author.id,
        ...(question.restricted ? { clientId: client.id } : {}),
        publicationState: question.publicationState,
        provenance: question.provenance,
        ...(question.source === undefined ? {} : { source: question.source }),
        tags: { create: question.tags.map((reference) => ({ tagId: tagId(tagIds, reference) })) },
      },
    });
  }
}

/** The seeded Tags, by the key a seeded Question names them with. */
async function seedCategoriesAndTags(database: Database): Promise<Map<string, string>> {
  const tagIds = new Map<string, string>();

  for (const category of seedCategories) {
    const stored = await database.category.upsert({
      where: { name: category.name },
      update: {},
      create: { name: category.name, displayName: category.displayName },
      select: { id: true },
    });
    for (const value of category.tags) {
      const tag = await database.tag.upsert({
        where: { categoryId_value: { categoryId: stored.id, value } },
        update: {},
        create: { categoryId: stored.id, value },
        select: { id: true },
      });
      tagIds.set(tagKey({ category: category.name, tag: value }), tag.id);
    }
  }

  return tagIds;
}

/** A seeded Question naming a Tag no seeded Category holds is a mistake in this file. */
function tagId(tagIds: Map<string, string>, reference: SeedTagReference): string {
  const id = tagIds.get(tagKey(reference));
  if (!id) throw new Error(`The seed names a Tag that is not seeded: ${tagKey(reference)}.`);
  return id;
}
