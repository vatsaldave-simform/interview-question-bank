import { cn } from "cn";

/** Stands in until the login screen arrives in chunk 4 of #13. It exists so the
 * toolchain has something to prove itself against: an import through `@/`, a Tailwind
 * class, and a render into a DOM. */
export function SignedOutNotice({ className }: { className?: string }) {
  return <p className={cn("text-muted-foreground text-sm", className)}>The bank is awake.</p>;
}
