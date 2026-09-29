import { CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Says an act worked, right where it happened. */
export function DoneMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      <CircleCheckIcon aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
