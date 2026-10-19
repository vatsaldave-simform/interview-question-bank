import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTheWholeClient } from "./helpers/the-whole-client";

/** The line the design owners chose for the login screen on #145. */
describe("the login screen", () => {
  it("leads with the line about the bank", async () => {
    renderTheWholeClient("/login");

    expect(
      await screen.findByRole("heading", {
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

  it("asks the visitor to sign in", async () => {
    renderTheWholeClient("/login");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
