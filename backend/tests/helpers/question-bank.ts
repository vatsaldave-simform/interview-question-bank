import type { Viewer, ViewerRole } from "@iqb/shared";
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

/** The seeded Viewer of a role, as the scoped query builder wants one. */
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
