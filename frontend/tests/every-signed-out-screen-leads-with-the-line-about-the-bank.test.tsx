import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTheWholeClient } from "./helpers/the-whole-client";

/** The line the design owners chose for the login screen on #145, and the two screens that
 * share its layout. */
describe("every signed-out screen", () => {
  it.each([
    ["/login", "Sign in"],
    ["/forgotten-password", "Forgotten your password?"],
    ["/set-password#token=a-token", "Set your password"],
  ])("leads with the line about the bank at %s", async (address, title) => {
    renderTheWholeClient(address);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Better interviews start with better questions.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Search the questions our interviewers have written, checked and rated. Then add your own for the next person.",
      ),
    ).toBeInTheDocument();
  });
});
