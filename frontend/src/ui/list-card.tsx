import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";

type ListCardProps = {
  children: ReactNode;
  /** The buttons, on the right of the card, or under it on a phone. */
  acts?: ReactNode;
  /** Set to false where the artifact keeps the card still, even though its title is a link. */
  lifts?: boolean;
};

/** One item in a list a Viewer works through, such as the Review queue. */
export function ListCard({ children, acts, lifts = true }: ListCardProps) {
  return (
    <Card
      data-lifts={lifts ? undefined : "false"}
      className="flex-row flex-wrap items-center justify-between gap-x-4.5 gap-y-3 p-(--spacing-panel)"
    >
      <div className="flex min-w-0 flex-[1_1_22.5rem] flex-col gap-2">{children}</div>
      {acts !== undefined && <div className="flex flex-wrap gap-2">{acts}</div>}
    </Card>
  );
}
