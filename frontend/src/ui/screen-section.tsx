import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";

type ScreenSectionProps = {
  id: string;
  title: string;
  /** Shown on the heading's line, after the title. */
  beside?: ReactNode;
  children: ReactNode;
};

export function ScreenSection({ id, title, beside, children }: ScreenSectionProps) {
  return (
    <section aria-labelledby={id}>
      <Card className="gap-3 p-(--spacing-panel)">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={id} className="min-w-0 text-lg font-[650]">
            {title}
          </h2>
          {/* The title wraps before this does, so the link stays on the heading's line. */}
          {beside !== undefined && <div className="shrink-0">{beside}</div>}
        </div>
        {children}
      </Card>
    </section>
  );
}
