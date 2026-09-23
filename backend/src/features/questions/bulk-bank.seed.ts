import { createHash } from "node:crypto";
import type { CategoryName, Provenance, PublicationState } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";
import { seedClient } from "../clients/clients.seed.ts";
import { seedViewerByRole } from "../viewers/viewers.seed.ts";

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

/**
 * The words a keyword search can be aimed at, commonest first. Fixed rather than picked
 * per seed value, so two banks written from different seed values can still be timed
 * against the same search.
 */
export const bankVocabulary = [
  "test", "data", "design", "failure", "latency", "cache", "queue", "index", "retry", "timeout",
  "schema", "migration", "rollback", "logging", "tracing", "metrics", "deadlock", "transaction",
  "isolation", "replication", "sharding", "pagination", "throttling", "backpressure",
  "idempotency", "concurrency", "immutability", "serialization", "validation", "authentication",
  "authorization", "encryption", "hashing", "tokens", "sessions", "cookies", "middleware",
  "routing", "streaming", "batching", "polling", "webhooks", "versioning", "deprecation",
  "rate limiting", "circuit breaker", "feature flags", "canary release", "observability",
  "profiling", "garbage collection", "memory leak", "thread pool", "connection pooling",
  "load balancing", "service discovery", "leader election", "consensus", "eventual consistency",
  "checkpointing", "compaction", "bloom filter", "trie", "heap", "quicksort", "binary search",
  "lookup table", "linked list", "recursion", "memoization", "dynamic programming",
  "graph traversal", "topological sort", "union find", "sliding window", "two pointers",
  "closure", "hoisting", "prototype chain", "event loop", "microtask", "promise", "generator",
  "decorator", "mixin", "dependency injection", "inversion of control", "liskov substitution",
  "open closed", "single responsibility", "law of demeter", "anti-corruption layer",
  "bounded context", "ubiquitous language",
] as const;

/** How many of those words one Question carries, three in its text and two in its Answer
 * Notes. Five is what spreads a search across half the bank for the commonest word, one
 * Question in fifty for the rarest, and four in a thousand for a pair of them. */
const wordsPerQuestion = 5;

/** The same curve `pickTag` uses, and for the same reason: a search that matches as much
 * of the bank whatever it asks for cannot tell one query plan from another (ADR-0011). */
const wordWeighting = 2.2;

type QuestionFrame = (first: string, second: string, third: string) => string;
type AnswerNotesFrame = (first: string, second: string) => string;

const questionFrames: readonly QuestionFrame[] = [
  (a, b, c) => `How would you approach ${a} when ${b} and ${c} pull in different directions?`,
  (a, b, c) => `Explain what ${a} costs a team that already relies on ${b}, and where ${c} fits.`,
  (a, b, c) =>
    `Describe a time ${a} failed in production. What did ${b} tell you, and what did you ` +
    `change about ${c}?`,
  (a, b, c) => `When would you choose ${a} over ${b}, and what does that decide about ${c}?`,
  (a, b, c) => `Walk through how you would prove ${a} holds under load, given ${b} and ${c}.`,
  (a, b, c) => `A service is slow and ${a} looks healthy. How do ${b} and ${c} narrow it down?`,
];

const answerNotesFrames: readonly AnswerNotesFrame[] = [
  (a, b) => `Look for ${a} named without prompting, and for the ${b} they would measure first.`,
  (a, b) => `A strong answer weighs ${a} against ${b} rather than picking one and defending it.`,
  (a, b) => `Expect ${a} to come up early. ${b} is the follow-up that separates depth from recall.`,
  (a, b) => `Watch for an answer that treats ${a} as free, and ask what ${b} costs first.`,
];

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

    const words = wordsFor(seed, key);
    questionRows.push({
      id,
      text: questionText(seed, key, words),
      answerNotes: answerNotesText(seed, key, words),
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

/** The words one Question carries, drawn from the front of the vocabulary far more often
 * than from the back. */
function wordsFor(seed: string, key: string): string[] {
  const carried: string[] = [];
  for (let pick = 0; pick < wordsPerQuestion; pick += 1) {
    carried.push(nextWordAfter(carried, randomFor(seed, `${key}:word:${pick}`)));
  }
  return carried;
}

/** Steps past a word the Question already carries, so no sentence names the same thing
 * twice. */
function nextWordAfter(carried: readonly string[], random: number): string {
  let at = Math.floor(random ** wordWeighting * bankVocabulary.length);
  while (carried.includes(bankVocabulary[at]!)) at = (at + 1) % bankVocabulary.length;
  return bankVocabulary[at]!;
}

function questionText(seed: string, key: string, words: readonly string[]): string {
  const frame = pickFrame(questionFrames, randomFor(seed, `${key}:frame`));
  return frame(words[0]!, words[1]!, words[2]!);
}

function answerNotesText(seed: string, key: string, words: readonly string[]): string {
  const frame = pickFrame(answerNotesFrames, randomFor(seed, `${key}:notes`));
  return frame(words[3]!, words[4]!);
}

/** Evenly, unlike the words: a frame is the sentence around the words and is not what a
 * search is aimed at. */
function pickFrame<Frame>(frames: readonly Frame[], random: number): Frame {
  return frames[Math.floor(random * frames.length)]!;
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
