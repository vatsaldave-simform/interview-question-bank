import type { ReactNode } from "react";
import { Card } from "@/ui/shadcn/card";

type ScreenSectionProps = { id: string; title: string; children: ReactNode };

export function ScreenSection({ id, title, children }: ScreenSectionProps) {
  return (
    <section aria-labelledby={id}>
      <Card className="gap-3 px-6">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}
