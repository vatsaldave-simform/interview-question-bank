import { Card, CardContent, CardHeader } from "@/ui/shadcn/card";
import { Skeleton } from "@/ui/shadcn/skeleton";

/** Shaped like a page of `QuestionCard`s, so the page does not jump when they arrive. */
export function QuestionCardsLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((card) => (
        <Card key={card}>
          <CardHeader>
            <Skeleton className="bg-muted h-5 w-3/4" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="bg-muted h-4 w-full" />
              <Skeleton className="bg-muted h-4 w-full" />
              <Skeleton className="bg-muted h-4 w-2/3" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="bg-muted h-5 w-16 rounded-full" />
              <Skeleton className="bg-muted h-5 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
