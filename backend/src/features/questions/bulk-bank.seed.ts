import { createHash } from "node:crypto";
import type { CategoryName, Provenance, PublicationState } from "@iqb/shared";
import type { Database } from "../../platform/database.js";
import { seedClient } from "../clients/clients.seed.js";
import { seedViewerByRole } from "../viewers/viewers.seed.js";

export type BulkBankOptions = {
  count: number;
  /** Every choice below comes from this and not from `Math.random`, so the same value
   * writes the same bank again. */
  seed: string;
};

/** Ten thousand Questions is the size ADR-0011 timed both SQL shapes at. */
export const defaultBulkBank: BulkBankOptions = { count: 10_000, seed: "bulk-bank" };

/** What this file's own Tag values start with, so nobody reads one as curated. */
export const bulkTagPrefix = "bulk-";

type CategoryTagging = {
  /** Tag values added beside the ones the small seed wrote. */
  extraTags: number;
  /** The share of Questions carrying any Tag at all from this Category. */
  coverage: number;
  /** The most Tags one Question carries from this Category. */
  maxTags: number;
};

/** Different per Category on purpose: a bank where every Category matches about as much
 * as every other cannot tell a query that stops early from one that does not (ADR-0011). */
const taggingPerCategory: Record<CategoryName, CategoryTagging> = {
  technology: { extraTags: 40, coverage: 0.95, maxTags: 3 },
  seniority: { extraTags: 2, coverage: 1, maxTags: 1 },
  "question-type": { extraTags: 6, coverage: 1, maxTags: 2 },
};

const restrictedShare = 0.2;
const provenances: readonly Provenance[] = ["original", "adapted", "inherited"];

/** Rows go in this many at a time, so a bank is not one enormous statement. */
const batchSize = 500;

export type BulkBankSummary = {
  /** The bank this seed value stands for, whether or not this run had to write it. */
  questions: number;
  restricted: number;
  /** What this run wrote; zero for both when the bank was already there. */
  questionsWritten: number;
  tagsWritten: number;
};

type TagRow = { id: string; value: string };

/**
 * A bank big enough to time a query against, kept off `pnpm db:seed` so that seed stays
 * short enough to read. It builds on that seed rather than beside it: the Categories,
 * the Author and the Client it hangs Questions from are that seed's rows.
 */
export async function seedBulkBank(
  database: Database,
  { count, seed }: BulkBankOptions,
): Promise<BulkBankSummary> {
  const tagsPerCategory = await seedBulkTags(database, seed);
  const author = await database.viewer.findUniqueOrThrow({
    where: { email: seedViewerByRole("author").email },
    select: { id: true },
  });
  const client = await database.client.findUniqueOrThrow({
    where: { name: seedClient.name },
    select: { id: true },
  });

  const questionRows = [];
  const questionTagRows = [];
  let restricted = 0;

  for (let n = 0; n < count; n += 1) {
    const key = `question:${n}`;
    const id = uuidFor(seed, key);
    const isRestricted = randomFor(seed, `${key}:restricted`) < restrictedShare;
    if (isRestricted) restricted += 1;

    questionRows.push({
      id,
      text: `Bulk bank Question ${n}: how would you approach the case it describes?`,
      answerNotes: `Answer notes for bulk bank Question ${n}: look for the trade-off named.`,
      authorId: author.id,
      clientId: isRestricted ? client.id : null,
      publicationState: publicationStateFor(randomFor(seed, `${key}:state`)),
      provenance: provenances[n % provenances.length]!,
      createdAt: createdAtFor(seed, key),
    });

    for (const [category, tags] of tagsPerCategory) {
      const tagging = taggingPerCategory[category];
      if (randomFor(seed, `${key}:carries:${category}`) >= tagging.coverage) continue;
      const howMany = 1 + Math.floor(randomFor(seed, `${key}:count:${category}`) * tagging.maxTags);
      for (let pick = 0; pick < howMany; pick += 1) {
        const tag = pickTag(tags, randomFor(seed, `${key}:tag:${category}:${pick}`));
        questionTagRows.push({ questionId: id, tagId: tag.id });
      }
    }
  }

  // Tags after the Questions they point at. Both skip a row that is already there: the
  // same seed value may run twice, and one Question may pick one Tag twice.
  const questionsWritten = await insertInBatches(questionRows, (rows) =>
    database.question.createMany({ data: rows, skipDuplicates: true }),
  );
  const tagsWritten = await insertInBatches(questionTagRows, (rows) =>
    database.questionTag.createMany({ data: rows, skipDuplicates: true }),
  );

  return { questions: count, restricted, questionsWritten, tagsWritten };
}

/**
 * Adds Tag values to the Categories the small seed wrote, and adds no Category
 * (ADR-0024). What comes back is every Tag of each Category, the curated values
 * included, so a test can filter on `typescript` and get a bank-sized answer.
 */
async function seedBulkTags(
  database: Database,
  seed: string,
): Promise<Map<CategoryName, TagRow[]>> {
  const tagsPerCategory = new Map<CategoryName, TagRow[]>();

  for (const [name, tagging] of categoriesToTag()) {
    const category = await database.category.findUniqueOrThrow({
      where: { name },
      select: { id: true },
    });
    for (let n = 0; n < tagging.extraTags; n += 1) {
      const value = `${bulkTagPrefix}${name}-${String(n).padStart(2, "0")}`;
      await database.tag.upsert({
        where: { categoryId_value: { categoryId: category.id, value } },
        update: {},
        create: { categoryId: category.id, value },
      });
    }
    const tags = await database.tag.findMany({
      where: { categoryId: category.id },
      select: { id: true, value: true },
    });
    tagsPerCategory.set(name, inPopularityOrder(seed, name, tags));
  }

  return tagsPerCategory;
}

/** A fixed order that is not the alphabet, so a common Tag is not always one whose
 * value starts with an early letter. */
function inPopularityOrder(seed: string, category: CategoryName, tags: TagRow[]): TagRow[] {
  return [...tags].sort(
    (one, other) =>
      randomFor(seed, `popularity:${category}/${one.value}`) -
      randomFor(seed, `popularity:${category}/${other.value}`),
  );
}

/** Weighted toward the front, so some Tags are carried by a third of the bank and some
 * by one Question in fifty (ADR-0011). */
function pickTag(tags: TagRow[], random: number): TagRow {
  return tags[Math.floor(random ** 2.2 * tags.length)]!;
}

/** Mostly Published, so a filter has a bank to answer from, and enough of the other two
 * that the second check has something to keep out. */
function publicationStateFor(random: number): PublicationState {
  if (random < 0.8) return "published";
  if (random < 0.94) return "pending";
  return "rejected";
}

const bankStartsAt = Date.UTC(2024, 0, 1);

/** Half-hour steps across one year. Far fewer than a bank worth timing has Questions,
 * so two of them share a createdAt and the id tiebreaker has a tie to break. */
const timeSlots = 17_520;

/** Unrelated to the order the rows go in, so the index the bank is ordered by is not
 * accidentally the order of the table. It ignores the count, so the bank for a small
 * count is part of the bank for a large one rather than a squeezed version of it. */
function createdAtFor(seed: string, key: string): Date {
  const slot = Math.floor(randomFor(seed, `${key}:created`) * timeSlots);
  return new Date(bankStartsAt + slot * 30 * 60_000);
}

/** From the seed value and the key alone, so nothing here changes between runs. */
function randomFor(seed: string, key: string): number {
  return createHash("sha256").update(`${seed}:${key}`).digest().readUInt32BE(0) / 2 ** 32;
}

/** Worked out the same way, so a second run recognises the Question and leaves it. */
function uuidFor(seed: string, key: string): string {
  const hex = createHash("sha256").update(`${seed}:${key}`).digest("hex");
  const version = `4${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${variant}-${hex.slice(20, 32)}`;
}

/** How many rows were new: `createMany` counts only the ones it wrote. */
async function insertInBatches<Row>(
  rows: Row[],
  write: (batch: Row[]) => Promise<{ count: number }>,
): Promise<number> {
  let written = 0;
  for (let start = 0; start < rows.length; start += batchSize) {
    written += (await write(rows.slice(start, start + batchSize))).count;
  }
  return written;
}

/** `Object.entries` widens the key to `string`, which loses the closed Category list. */
function categoriesToTag(): [CategoryName, CategoryTagging][] {
  return Object.entries(taggingPerCategory) as [CategoryName, CategoryTagging][];
}
