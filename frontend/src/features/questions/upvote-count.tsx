import type { Question, UpvoteSummary } from "@iqb/shared";
import { cn } from "cn";
import { ArrowBigUpIcon } from "lucide-react";

/** A returned Question keeps the Upvotes it was given, but one never Published has none. */
export function upvotesAreShown({ publicationState, upvotes }: Question): boolean {
  return publicationState === "published" || upvotes.count > 0;
}

/** What a screen reader hears in place of the bare number beside the arrow. */
export function upvotesWording({ count, mine }: UpvoteSummary): string {
  const upvotes = count === 1 ? "1 Upvote" : `${count} Upvotes`;
  return mine ? `${upvotes}, including yours` : upvotes;
}

/** The count alone, and nothing that could say who gave an Upvote (CONTEXT.md). */
export function UpvoteCount({ upvotes }: { upvotes: UpvoteSummary }) {
  return (
    <p className={cn("flex items-center gap-1", upvotes.mine && "text-brand-action")}>
      <ArrowBigUpIcon aria-hidden="true" className={cn("size-4", upvotes.mine && "fill-current")} />
      <span aria-hidden="true">{upvotes.count}</span>
      <span className="sr-only">{upvotesWording(upvotes)}</span>
    </p>
  );
}
