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
      <Card className="gap-3 px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          {beside}
        </div>
        {children}
      </Card>
    </section>
  );
}
