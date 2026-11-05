import type { UpvoteSummary, Viewer } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";

/** The caller has checked the Question is one this Viewer may upvote, because nothing here
 * can. Safe to run twice: a second Upvote from the same Viewer is skipped. */
export async function saveUpvote(database: Database, viewer: Viewer, questionId: string): Promise<void> {
  await database.upvote.createMany({
    data: [{ questionId, viewerId: viewer.id }],
    skipDuplicates: true,
  });
}

/** Safe to run twice: taking back an Upvote that is not there changes nothing. */
export async function removeUpvote(
  database: Database,
  viewer: Viewer,
  questionId: string,
): Promise<void> {
  await database.upvote.deleteMany({ where: { questionId, viewerId: viewer.id } });
}

/** Only for Questions already read through the visibility check and already picked for the
 * page, because this looks them up by id alone (ADR-0043). */
export async function withUpvoteSummaries<Q extends { id: string }>(
  database: Database,
  viewer: Viewer,
  questions: readonly Q[],
): Promise<(Q & { upvotes: UpvoteSummary })[]> {
  if (questions.length === 0) return [];
  const questionIds = questions.map(({ id }) => id);

  // One query for both, since whether the Viewer gave one is a yes or no over the same rows.
  const totals = await database.$queryRaw<{ questionId: string; count: number; mine: boolean }[]>`
    SELECT "questionId",
           count(*)::int AS count,
           bool_or("viewerId" = ${viewer.id}::uuid) AS mine
      FROM upvotes
     WHERE "questionId" = ANY(${questionIds}::uuid[])
     GROUP BY "questionId"
  `;

  // A Question nobody has upvoted has no rows, so it comes back from the query as nothing.
  const totalFor = new Map(totals.map((total) => [total.questionId, total]));
  return questions.map((question) => {
    const total = totalFor.get(question.id);
    return {
      ...question,
      upvotes: { count: total?.count ?? 0, mine: total?.mine ?? false },
    };
  });
}

export async function withUpvoteSummary<Q extends { id: string }>(
  database: Database,
  viewer: Viewer,
  question: Q,
): Promise<Q & { upvotes: UpvoteSummary }> {
  const [summarised] = await withUpvoteSummaries(database, viewer, [question]);
  if (summarised === undefined) throw new Error(`No Upvote summary came back for ${question.id}.`);
  return summarised;
}
