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
    <nav className="flex items-center justify-between gap-4" aria-label="Pages">
      <Button
        variant="outline"
        disabled={offset === 0}
        onClick={() => onMove(Math.max(offset - questionPageSize, 0))}
      >
        Previous page
      </Button>
      {shown !== null && shown > 0 && (
        <span className="text-muted-foreground text-sm">
          Questions {offset + 1}–{offset + shown}
        </span>
      )}
      <Button
        variant="outline"
        disabled={!mayBeMore}
        onClick={() => onMove(offset + questionPageSize)}
      >
        Next page
      </Button>
    </nav>
  );
}
