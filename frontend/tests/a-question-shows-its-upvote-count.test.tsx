import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("a card's Upvote count", () => {
  it("shows the count on each card, coloured only where the Viewer gave one", async () => {
    aBankHolding([
      aQuestion({ upvotes: { count: 4, mine: true } }),
      aQuestion({ id: "a0000000-0000-4000-8000-000000000002", upvotes: { count: 1, mine: false } }),
    ]);
    renderTheWholeClient("/questions");

    const cards = await screen.findAllByRole("article");
    const given = within(cards[0]!).getByText("4 Upvotes, including yours");
    const notGiven = within(cards[1]!).getByText("1 Upvote");
    expect(given.closest("p")).toHaveClass("text-brand-action");
    expect(notGiven.closest("p")).not.toHaveClass("text-brand-action");
  });

  it("offers no button on a card, only the count", async () => {
    aBankHolding([aQuestion({ upvotes: { count: 2, mine: false } })]);
    renderTheWholeClient("/questions");

    const [card] = await screen.findAllByRole("article");
    expect(within(card!).getByText("2 Upvotes")).toBeInTheDocument();
    expect(within(card!).queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument();
  });

  it("shows nothing on the card of a Question that was never Published", async () => {
    aBankHolding([aQuestion({ publicationState: "pending" })]);
    renderTheWholeClient("/questions");

    const [card] = await screen.findAllByRole("article");
    expect(within(card!).queryByText(/Upvote/)).not.toBeInTheDocument();
  });
});
