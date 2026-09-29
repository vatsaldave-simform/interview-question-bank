import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { questionPageSize } from "@/features/questions/question-pages.schema";
import { Button } from "@/ui/shadcn/button";

type QuestionPagesProps = {
  offset: number;
  /** How many Questions the page on screen holds, or null while it has not answered. */
  shown: number | null;
  onMove: (offset: number) => void;
};

export function QuestionPages({ offset, shown, onMove }: QuestionPagesProps) {
  // The API sends no total (ADR-0025), so a full page is the only sign there may be more.
  const mayBeMore = shown === questionPageSize;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-label="Pages">
      <Button
        variant="outline"
        size="sm"
        disabled={offset === 0}
        onClick={() => onMove(Math.max(offset - questionPageSize, 0))}
      >
        <ChevronLeftIcon aria-hidden="true" />
        Previous page
      </Button>
      {shown !== null && shown > 0 && (
        // On a phone the count takes its own line, since it does not fit between the buttons.
        <span className="text-muted-foreground order-first w-full text-center text-sm tabular-nums sm:order-none sm:w-auto">
          Questions {offset + 1}–{offset + shown}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!mayBeMore}
        onClick={() => onMove(offset + questionPageSize)}
      >
        Next page
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </nav>
  );
}
