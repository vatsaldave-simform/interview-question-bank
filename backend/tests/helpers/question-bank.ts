import type { CategoryName, Viewer, ViewerRole } from "@iqb/shared";
import {
  seedBulkBank,
  type BulkBankOptions,
} from "../../src/features/questions/bulk-bank.seed.js";
import type { TagsInCategory } from "../../src/features/questions/questions.repository.js";
import { seedClientAndGrants } from "../../src/features/clients/clients.seed.js";
import { seedQuestionBank } from "../../src/features/questions/questions.seed.js";
import { seedViewerAccounts } from "../../src/features/viewers/viewers.seed.js";
import type { Database } from "../../src/platform/database.js";
import { seededViewer } from "./auth.js";
import type { TestApi } from "./test-api.js";
import { truncateAll } from "./test-database.js";

/** An empty database filled with the fixtures, in the order the dependencies run. */
export async function seedTheBank(database: Database): Promise<void> {
  await truncateAll(database);
  await seedViewerAccounts(database);
  await seedClientAndGrants(database);
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
export async function commonestTagIds(
  database: Database,
  category: CategoryName,
  howMany: number,
): Promise<string[]> {
  const carried = await database.questionTag.groupBy({
    by: ["tagId"],
    where: { tag: { category: { name: category } } },
    _count: { _all: true },
    orderBy: { _count: { tagId: "desc" } },
    take: howMany,
  });
  return carried.map((tag) => tag.tagId);
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

/** The seeded Viewer of a role, in the shape the shared query function wants. */
export function viewerByRole(database: Database, role: ViewerRole): Promise<Viewer> {
  return database.viewer.findUniqueOrThrow({
    where: { email: seededViewer(role).email },
    select: { id: true, email: true, role: true },
  });
}

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

/** A Question good enough to be accepted, for a test varying one thing about it. */
export function aQuestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    text: "How would you introduce a cache without making staleness someone else's problem?",
    answerNotes: "Look for invalidation being designed rather than hoped for.",
    provenance: "original",
    ...overrides,
  };
}
