import { Skeleton } from "@/ui/shadcn/skeleton";

type RowsLoadingProps = {
  /** Read out in place of the shapes, as in "Loading the Viewers…". */
  label: string;
  rows?: number;
};

export function RowsLoading({ label, rows = 3 }: RowsLoadingProps) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-9 w-full" />
      ))}
    </div>
  );
}
