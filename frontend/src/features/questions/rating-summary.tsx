import type { Question } from "@iqb/shared";

/** A Question that was never Published was never rated, so it has nothing to show. A
 * returned one keeps the Ratings it was given. */
export function ratingIsShown({ publicationState, rating }: Question): boolean {
  return publicationState === "published" || rating.count > 0;
}

/** The average and the count, and nothing that could say who gave a Rating (CONTEXT.md). */
export function RatingSummary({ rating }: { rating: Question["rating"] }) {
  if (rating.average === null) return <p className="text-muted-foreground">Not rated yet</p>;
  const ratings = rating.count === 1 ? "1 Rating" : `${rating.count} Ratings`;
  return (
    <p>
      {rating.average.toFixed(1)} out of 5 from {ratings}
    </p>
  );
}
