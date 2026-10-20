import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";
import { TableHead } from "@/ui/shadcn/table";

/** Holds a `Table`, so it does not sit straight on the backdrop. */
export function TableCard({ children }: { children: ReactNode }) {
  return <Card className="px-1.5 py-1">{children}</Card>;
}

export function ColumnHead({ children }: { children: ReactNode }) {
  return (
    <TableHead className="text-muted-foreground p-3 text-xs font-semibold tracking-wider uppercase">
      {children}
    </TableHead>
  );
}
