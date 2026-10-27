import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, anAdministrator, answersWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

it("shows an icon on a Rejected chip, and a screen reader hears only Rejected", async () => {
  signInAs();
  const turnedDown = aQuestion({
    id: "a0000000-0000-4000-8000-000000000041",
    text: "What is 2 + 2?",
    publicationState: "rejected",
    reason: "Too easy to tell anyone anything about the candidate.",
  });
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/questions/own" ? aPageOf([turnedDown], asked) : undefined,
  );

  renderTheWholeClient("/questions/own");

  const list = await screen.findByRole("list", { name: "Your Questions" });
  const chip = within(list).getByText("Rejected");
  expect(chip).toHaveTextContent(/^Rejected$/);
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

it("shows an icon on a Deactivated chip, and a screen reader hears only Deactivated", async () => {
  signInAs(anAdministrator);
  const left = aViewer({
    id: "7c3b4a1e-0000-4000-8000-000000000019",
    email: "gone@iqb.test",
    isDeactivated: true,
  });
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/viewers" ? answersWith({ viewers: [left] }) : undefined,
  );

  renderTheWholeClient("/administration/viewers");

  const table = await screen.findByRole("table", { name: "Viewers" });
  const chip = within(table).getByText("Deactivated");
  expect(chip).toHaveTextContent(/^Deactivated$/);
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
