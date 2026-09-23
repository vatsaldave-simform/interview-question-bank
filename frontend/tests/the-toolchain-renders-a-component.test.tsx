import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cn } from "cn";
import { SignedOutNotice } from "@/platform/signed-out-notice";

/**
 * Chunk one of #13 ships no screen, so this is what says the toolchain works: a stylesheet
 * reached through the `@/` alias, a component rendered into a DOM, and Tailwind classes
 * merged the way every generated component merges them. Each of those is set up in a
 * different file, and a mistake in any of them fails here rather than in the first ticket
 * that writes a screen.
 */
describe("the client's toolchain", () => {
  it("renders a component whose import goes through the @/ alias", () => {
    render(<SignedOutNotice />);

    expect(screen.getByText("The bank is awake.")).toBeInTheDocument();
  });

  it("lets a later Tailwind class beat an earlier one that sets the same thing", () => {
    // What a component taking a `className` relies on: the caller's padding wins, and a
    // class the caller did not touch survives.
    expect(cn("p-2 text-sm", "p-4")).toBe("text-sm p-4");
  });
});
