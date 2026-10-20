import { describe, expect, it } from "vitest";
import { cn } from "cn";

/**
 * Every generated component merges the caller's classes with its own through `cn`, and
 * nothing else in the client pins that behaviour. A component that took a `className`
 * and ignored it would still render, so this is what catches it.
 */
describe("merging Tailwind classes", () => {
  it("lets a later class beat an earlier one that sets the same thing", () => {
    // What a component taking a `className` relies on: the caller's padding wins, and a
    // class the caller did not touch survives.
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
  });

  it("lets the shared panel padding replace a card's own", () => {
    expect(cn("gap-6 py-6", "p-(--spacing-panel)")).toBe("gap-6 p-(--spacing-panel)");
  });
});
