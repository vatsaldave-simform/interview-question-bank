import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";

type ListCardProps = {
  children: ReactNode;
  /** The buttons, on the right of the card, or under it on a phone. */
  acts?: ReactNode;
};

/** One item in a list a Viewer works through, such as the Review queue. */
export function ListCard({ children, acts }: ListCardProps) {
  return (
    <Card className="flex-row flex-wrap items-center justify-between gap-x-4.5 gap-y-3 px-4.5 py-4">
      <div className="flex min-w-0 flex-[1_1_22.5rem] flex-col gap-2">{children}</div>
      {acts !== undefined && <div className="flex flex-wrap gap-2">{acts}</div>}
    </Card>
  );
}
