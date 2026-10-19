import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/ui/shadcn/empty";

type EmptyListProps = {
  icon: LucideIcon;
  /** Says the list is empty, as in "Nothing is waiting for review". */
  title: string;
  /** Says what to do next. */
  children: ReactNode;
  /** The act to offer, left out when the Viewer may not do it. */
  action?: ReactNode;
};

/** In place of a list with nothing in it, so the Viewer is told what to do next. */
export function EmptyList({ icon: Icon, title, children, action }: EmptyListProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <Card className="py-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              <h2 id={titleId}>{title}</h2>
            </EmptyTitle>
            <EmptyDescription>{children}</EmptyDescription>
          </EmptyHeader>
          {action !== undefined && <EmptyContent>{action}</EmptyContent>}
        </Empty>
      </Card>
    </section>
  );
}
