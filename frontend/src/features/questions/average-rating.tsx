import { highestRating, type Question, type RatingSummary } from "@iqb/shared";

/** A returned Question keeps the Ratings it was given, but one never Published has none. */
export function ratingIsShown({ publicationState, rating }: Question): boolean {
  return publicationState === "published" || rating.count > 0;
}

/** The average and the count, and nothing that could say who gave a Rating (CONTEXT.md). */
export function AverageRating({ rating }: { rating: RatingSummary }) {
  if (rating.average === null) return <p className="text-muted-foreground">Not rated yet</p>;
  const ratings = rating.count === 1 ? "1 Rating" : `${rating.count} Ratings`;
  return (
    <p>
      {rating.average.toFixed(1)} out of {highestRating} from {ratings}
    </p>
  );
}
