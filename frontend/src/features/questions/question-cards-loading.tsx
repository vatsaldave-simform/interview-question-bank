import { Card } from "@/ui/shadcn/card";
import { Skeleton } from "@/ui/shadcn/skeleton";

/** The grid Browse lays its `QuestionCard`s in, one column on a phone. */
export const questionGrid =
  "grid grid-cols-[repeat(auto-fill,minmax(min(100%,20.625rem),1fr))] gap-3.5";

type QuestionCardsLoadingProps = {
  label: string;
  /** Set on Browse, whose cards sit in `questionGrid` rather than in one column. */
  inGrid?: boolean;
};

/** Shaped like a page of `QuestionCard`s, so the page does not jump when they arrive. */
export function QuestionCardsLoading({ label, inGrid = false }: QuestionCardsLoadingProps) {
  return (
    <div role="status" className={inGrid ? questionGrid : "flex flex-col gap-4"}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map((card) => (
        <Card key={card} className="gap-2.5 p-(--spacing-panel)">
          <Skeleton className="bg-muted h-5 w-3/4" />
          <div className="flex flex-col gap-2">
            <Skeleton className="bg-muted h-4 w-full" />
            <Skeleton className="bg-muted h-4 w-full" />
            <Skeleton className="bg-muted h-4 w-2/3" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="bg-muted h-5 w-16 rounded-full" />
            <Skeleton className="bg-muted h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="bg-muted h-4 w-1/2" />
        </Card>
      ))}
    </div>
  );
}
