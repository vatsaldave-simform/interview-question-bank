import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

it("shows a clock on a Pending chip, and a screen reader hears only Pending", async () => {
  const waiting = aQuestion({
    id: "a0000000-0000-4000-8000-000000000031",
    text: "How would you explain a race condition to a new joiner?",
    publicationState: "pending",
  });
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/questions/own" ? aPageOf([waiting], asked) : undefined,
  );

  renderTheWholeClient("/questions/own");

  const list = await screen.findByRole("list", { name: "Your Questions" });
  const chip = within(list).getByText("Pending");
  expect(chip).toHaveTextContent(/^Pending$/);
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
