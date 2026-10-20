import type { ReactNode } from "react";

export function RowDetails({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {children}
    </div>
  );
}
