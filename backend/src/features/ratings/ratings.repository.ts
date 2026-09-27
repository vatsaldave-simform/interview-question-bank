import type { RatingSummary, Viewer } from "@iqb/shared";
import type { Database } from "../../platform/database.ts";

/** Replaces the Viewer's earlier Rating, if there is one. The caller has checked the Question
 * is one they may rate, because nothing here can. */
export async function saveRating(
  database: Database,
  viewer: Viewer,
  questionId: string,
  value: number,
): Promise<void> {
  await database.rating.upsert({
    where: { questionId_viewerId: { questionId, viewerId: viewer.id } },
    create: { questionId, viewerId: viewer.id, value },
    update: { value },
  });
}

/**
 * Each Question with its Rating summary, in the order given. Only for Questions already read
 * through the visibility check, since this looks them up by id alone, and only after the page
 * was cut, so a Rating can never change which Questions are on it (ADR-0043).
 */
export async function withRatingSummaries<Q extends { id: string }>(
  database: Database,
  viewer: Viewer,
  questions: readonly Q[],
): Promise<(Q & { rating: RatingSummary })[]> {
  if (questions.length === 0) return [];

  const questionIds = questions.map(({ id }) => id);
  const [totals, own] = await Promise.all([
    database.rating.groupBy({
      by: ["questionId"],
      where: { questionId: { in: questionIds } },
      _avg: { value: true },
      _count: { _all: true },
    }),
    database.rating.findMany({
      where: { viewerId: viewer.id, questionId: { in: questionIds } },
      select: { questionId: true, value: true },
    }),
  ]);

  const totalFor = new Map(totals.map((total) => [total.questionId, total]));
  const mineFor = new Map(own.map((rating) => [rating.questionId, rating.value]));
  return questions.map((question) => {
    const total = totalFor.get(question.id);
    return {
      ...question,
      rating: {
        average: total?._avg.value ?? null,
        count: total?._count._all ?? 0,
        mine: mineFor.get(question.id) ?? null,
      },
    };
  });
}

export async function withRatingSummary<Q extends { id: string }>(
  database: Database,
  viewer: Viewer,
  question: Q,
): Promise<Q & { rating: RatingSummary }> {
  const [rated] = await withRatingSummaries(database, viewer, [question]);
  if (rated === undefined) throw new Error(`No Rating summary came back for ${question.id}.`);
  return rated;
}
