import { questionResponseSchema, type CategoryName, type Viewer, type ViewerRole } from "@iqb/shared";
import {
  bankVocabulary,
  seedBulkBank,
  type BulkBankOptions,
} from "../../src/features/questions/bulk-bank.seed.ts";
import type { TagsInCategory } from "../../src/features/questions/questions.repository.ts";
import { seedClientsAndGrants } from "../../src/features/clients/clients.seed.ts";
import { seedQuestionBank } from "../../src/features/questions/questions.seed.ts";
import { seedViewerAccounts } from "../../src/features/viewers/viewers.seed.ts";
import type { Database } from "../../src/platform/database.ts";
import { seededViewer } from "./auth.ts";
import type { TestApi } from "./test-api.ts";
import { truncateAll } from "./test-database.ts";

/** An empty database filled with the fixtures, in the order the dependencies run. */
export async function seedTheBank(database: Database): Promise<void> {
  await truncateAll(database);
  await seedViewerAccounts(database);
  await seedClientsAndGrants(database);
  await seedQuestionBank(database);
}

/**
 * The Questions back as the seed writes them, leaving the Viewers, the Clients and the
 * Permission Grants alone. For a test that changes a Question and wants the next one to
 * start from the seeded bank: truncating everything would change the Viewer ids too, and
 * every access token already handed out would stop naming anybody.
 *
 * Truncated rather than deleted, because a Change Event cannot be deleted and neither can
 * a Question one names. No row trigger fires on a truncate, which is what leaves the test
 * database clearable (ADR-0027).
 */
export async function resetTheQuestions(database: Database): Promise<void> {
  await database.$executeRawUnsafe(
    "TRUNCATE TABLE questions, question_tags, change_events CASCADE",
  );
  await seedQuestionBank(database);
}

/** The fixtures plus a bulk bank, for a test that needs more than five Questions. */
export async function seedTheBulkBank(
  database: Database,
  options: BulkBankOptions,
): Promise<void> {
  await seedTheBank(database);
  await seedBulkBank(database, options);
}

/** The Tags of a Category that most of the bank carries, commonest first, so a filter
 * built from them answers with a page rather than a handful of rows. */
export async function commonestTags(
  database: Database,
  category: CategoryName,
  howMany: number,
): Promise<{ ids: string[]; values: string[] }> {
  const carried = await database.questionTag.groupBy({
    by: ["tagId"],
    where: { tag: { category: { name: category } } },
    _count: { _all: true },
    orderBy: { _count: { tagId: "desc" } },
    take: howMany,
  });
  const tags = await database.tag.findMany({
    where: { id: { in: carried.map((tag) => tag.tagId) } },
    select: { id: true, value: true },
  });
  // Back into the order the counts came in; `findMany` does not keep it.
  const byId = new Map(tags.map((tag) => [tag.id, tag.value]));
  const ids = carried.map((tag) => tag.tagId);
  return { ids, values: ids.map((id) => byId.get(id)!) };
}

/** The list request itself, for a test that wants to read the response it got. */
export function getQuestions(
  api: TestApi,
  params: Record<string, string | number | readonly string[]>,
  token: string,
): Promise<Response> {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value]) search.append(name, String(one));
  }
  return api.request(`/api/questions?${search.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * The ids a filtered read should come back with, in order, worked out in JavaScript
 * from every row. The query under test must do this work in the database, so the check
 * has to share no code with it, and no test has to write a `where` of its own (ADR-0003).
 */
export async function sameAnswerInJavaScript(
  database: Database,
  viewer: Viewer,
  tagsPerCategory: readonly TagsInCategory[],
): Promise<string[]> {
  const questions = await database.question.findMany({
    select: {
      id: true,
      clientId: true,
      publicationState: true,
      authorId: true,
      createdAt: true,
      tags: { select: { tagId: true } },
    },
  });
  const grants = await database.permissionGrant.findMany({
    where: { viewerId: viewer.id },
    select: { clientId: true },
  });
  const granted = new Set(grants.map((grant) => grant.clientId));

  return questions
    .filter((question) => question.clientId === null || granted.has(question.clientId))
    .filter(
      (question) =>
        viewer.role === "reviewer" ||
        question.publicationState === "published" ||
        question.authorId === viewer.id,
    )
    .filter((question) =>
      tagsPerCategory.every((named) =>
        question.tags.some((carried) => named.tagIds.includes(carried.tagId)),
      ),
    )
    .sort(
      (one, other) =>
        other.createdAt.getTime() - one.createdAt.getTime() ||
        (one.id < other.id ? 1 : one.id > other.id ? -1 : 0),
    )
    .map((question) => question.id);
}

/** The id of a seeded Client, which only the database knows: the seed names Clients but
 * the rows carry the ids. */
export async function clientIdNamed(database: Database, name: string): Promise<string> {
  const client = await database.client.findUniqueOrThrow({ where: { name }, select: { id: true } });
  return client.id;
}

/** The seeded Viewer of a role, in the shape the shared query function wants. */
export function viewerByRole(database: Database, role: ViewerRole): Promise<Viewer> {
  return database.viewer.findUniqueOrThrow({
    where: { email: seededViewer(role).email },
    select: { id: true, email: true, role: true, isAdministrator: true, isDeactivated: true },
  });
}

/** Seeded Questions a test names by hand. The ids are fixed by `questions.seed.ts`. */
export const seededQuestionIds = {
  /** Published and unrestricted. Its Answer Notes are the only place "merging" appears. */
  aboutTypeScript: "a0000000-0000-4000-8000-000000000001",
  /** Published, and restricted to the first Client: the Reader holds the Grant and the
   * Reviewer does not, which is the pair worth searching for. */
  aboutTheClientsPipeline: "a0000000-0000-4000-8000-000000000002",
  /** Pending and unrestricted, so a Reader may not reach it and a Reviewer may. */
  aboutDisagreeing: "a0000000-0000-4000-8000-000000000003",
  /** Published, and restricted to the second Client, so the Reviewer holds the Grant and
   * the Reader does not. The other way round from the pipeline one. */
  aboutTheOtherClientsBooking: "a0000000-0000-4000-8000-000000000006",
  /** Pending, and restricted to the second Client. */
  aboutTheOtherClientsIntake: "a0000000-0000-4000-8000-000000000007",
} as const;

/** The word the most bulk Questions carry — about half of them — so a search on it
 * answers with a large part of the bank rather than a handful of rows. No word is in
 * every bulk Question: a bank like that cannot tell one query plan from another. */
export const inMuchOfTheBulkBank = bankVocabulary[0];

/** The word the next most carry, for a search that has to match two words at once. */
export const alsoInMuchOfTheBulkBank = bankVocabulary[1];

/** A word only one seeded Question holds, and only in its Answer Notes. */
export const inOneAnswerNoteOnly = "merging";

/** A word only the second Client's Questions hold. */
export const inTheOtherClientsQuestionsOnly = "booking";

/** A word one Published Question of each Client holds, and nothing in the open bank. */
export const inBothClientsQuestions = "migrate";

/** A word no Question in the bank holds, which is what a genuine zero-match is. */
export const inNoQuestionAtAll = "kubernetes";

/** A Tag carried only by the second Client's Questions, and one carried by no Question
 * at all. A Category filter has to answer identically for the two. */
export const tagOnTheOtherClientsQuestionsOnly = { category: "technology", tag: "python" } as const;
export const tagOnNoQuestionAtAll = { category: "technology", tag: "javascript" } as const;

/** A uuid that is well formed and names nothing, which is what "does not exist" means. */
export const unknownQuestionId = "b0000000-0000-4000-8000-00000000ffff";

/** The add request itself, for a test that wants to read the response it got. */
export function postQuestion(api: TestApi, body: unknown, token: string): Promise<Response> {
  return api.request("/api/questions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function getQuestion(api: TestApi, id: string, token: string): Promise<Response> {
  return api.request(`/api/questions/${id}`, { headers: { authorization: `Bearer ${token}` } });
}

/** The edit request itself, for a test that wants to read the response it got. */
export function patchQuestion(
  api: TestApi,
  id: string,
  body: unknown,
  token: string,
): Promise<Response> {
  return api.request(`/api/questions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/** Adds a Question over HTTP and hands back its id, for a test whose subject is what
 * happened rather than the adding. */
export async function addAQuestion(
  api: TestApi,
  body: Record<string, unknown>,
  token: string,
): Promise<string> {
  const response = await postQuestion(api, aQuestion(body), token);
  if (response.status !== 201) throw new Error(`Adding a Question failed with ${response.status}.`);
  const added = questionResponseSchema.parse(await response.json());
  return added.question.id;
}

/** A Question good enough to be accepted, for a test varying one thing about it. */
export function aQuestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: "How would you introduce a cache without making staleness someone else's problem?",
    answerNotes: "Look for invalidation being designed rather than hoped for.",
    provenance: "original",
    ...overrides,
  };
}
