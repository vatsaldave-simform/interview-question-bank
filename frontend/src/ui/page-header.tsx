import type { ReactNode } from "react";
import { PageTrail, type Trail } from "@/ui/page-trail";

type PageHeaderProps = {
  title: ReactNode;
  /** For a list or a section that is named by the page's title. */
  titleId?: string;
  /** One sentence saying what the page is for, so it explains itself on a first visit. */
  description: ReactNode;
  /** The page's main button, shown on the right. */
  action?: ReactNode;
  /** The way back, for a page that no sidebar link leads to. */
  trail?: Trail;
};

/** The top of every signed-in screen, so they all start the same way. */
export function PageHeader({ title, titleId, description, action, trail }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {trail !== undefined && <PageTrail {...trail} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Grows and shrinks, so a long title wraps beside the action instead of pushing it
            onto a line of its own. */}
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1">
          <h1 id={titleId} className="text-2xl leading-snug font-semibold">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
