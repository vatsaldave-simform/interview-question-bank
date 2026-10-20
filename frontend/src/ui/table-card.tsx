import { cn } from "cn";
import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";
import { TableCell, TableHead, TableHeader, TableRow } from "@/ui/shadcn/table";
import { smallHeading } from "@/ui/small-heading";

/** Holds a `Table`, so it does not sit straight on the backdrop. Its cells carry the padding. */
export function TableCard({ children }: { children: ReactNode }) {
  return <Card className="px-1.5 py-1">{children}</Card>;
}

/** The row of `ColumnHead`s, which does not light up when pointed at like the rows under it. */
export function ColumnHeads({ children }: { children: ReactNode }) {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">{children}</TableRow>
    </TableHeader>
  );
}

export function ColumnHead({ children }: { children: ReactNode }) {
  return <TableHead className={`${smallHeading} p-3`}>{children}</TableHead>;
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <TableCell className={cn("p-3", className)}>{children}</TableCell>;
}
