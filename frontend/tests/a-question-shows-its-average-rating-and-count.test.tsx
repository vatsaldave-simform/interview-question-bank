import type { Question } from "@iqb/shared";
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

async function openThePageOf(question: Question): Promise<void> {
  aBankHolding([question]);
  renderTheWholeClient(`/questions/${question.id}`);
  await screen.findByRole("heading", { level: 1, name: question.text });
}

const ratingSection = () => screen.queryByRole("region", { name: "Rating" });

describe("a Question's average Rating and count", () => {
  it("shows the average to one decimal place, with the count", async () => {
    await openThePageOf(aQuestion({ rating: { average: 4.2857, count: 7, mine: null } }));

    expect(within(ratingSection()!).getByText("4.3 out of 5 from 7 Ratings")).toBeVisible();
  });

  it("counts a single Rating in the singular", async () => {
    await openThePageOf(aQuestion({ rating: { average: 5, count: 1, mine: null } }));

    expect(within(ratingSection()!).getByText("5.0 out of 5 from 1 Rating")).toBeVisible();
  });

  it("says a Published Question nobody has rated is not rated yet", async () => {
    await openThePageOf(aQuestion({ rating: { average: null, count: 0, mine: null } }));

    expect(within(ratingSection()!).getByText("Not rated yet")).toBeVisible();
  });

  it("shows nothing about Ratings on a Pending Question", async () => {
    await openThePageOf(aQuestion({ publicationState: "pending" }));

    expect(ratingSection()).not.toBeInTheDocument();
  });

  // A returned Question keeps the Ratings it was given while it was Published.
  it("shows the Ratings a returned Question kept", async () => {
    await openThePageOf(
      aQuestion({
        publicationState: "rejected",
        reason: "The Answer Notes are out of date.",
        rating: { average: 3, count: 2, mine: null },
      }),
    );

    expect(within(ratingSection()!).getByText("3.0 out of 5 from 2 Ratings")).toBeVisible();
  });

  it("shows each card's average and count in the list", async () => {
    aBankHolding([
      aQuestion({ rating: { average: 3.5, count: 4, mine: null } }),
      aQuestion({ id: "a0000000-0000-4000-8000-000000000002" }),
    ]);
    renderTheWholeClient("/");

    const cards = await screen.findAllByRole("article");
    expect(within(cards[0]!).getByText("3.5 out of 5 from 4 Ratings")).toBeVisible();
    expect(within(cards[1]!).getByText("Not rated yet")).toBeVisible();
  });
});
