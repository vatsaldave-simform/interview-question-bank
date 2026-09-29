import { Skeleton } from "@/ui/shadcn/skeleton";

type RowsLoadingProps = {
  /** Read out in place of the shapes, as in "Loading the Viewers…". */
  label: string;
  rows?: number;
  /** Set inside a card, which is already white, so the rows need no box of their own. */
  onCard?: boolean;
};

export function RowsLoading({ label, rows = 3, onCard = false }: RowsLoadingProps) {
  return (
    // A white box on the page, because grey shapes on the grey page are hard to see.
    <div
      role="status"
      className={
        onCard ? "flex flex-col gap-3" : "bg-card flex flex-col gap-3 rounded-md border p-4"
      }
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="bg-muted h-9 w-full" />
      ))}
    </div>
  );
}
