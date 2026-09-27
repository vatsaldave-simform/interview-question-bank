import type { Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith } from "./helpers/fake-api";
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

const adapted = aQuestion({
  id: "a0000000-0000-4000-8000-000000000011",
  text: "How does a log-structured store handle a crash?",
  provenance: "adapted",
  source: "Designing Data-Intensive Applications, chapter 3",
});

const inherited = aQuestion({
  id: "a0000000-0000-4000-8000-000000000012",
  text: "What is a closure?",
  provenance: "inherited",
  source: null,
});

/** Serves each Question on its own page, and all of them in the list. */
function aBankHolding(questions: Question[]): void {
  fakeBank(
    (asked) => aPageOf(questions, asked),
    (_request, asked) => {
      const one = questions.find(({ id }) => asked.pathname === `/api/questions/${id}`);
      if (one !== undefined) return answersWith({ question: one });
      if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
      return undefined;
    },
  );
}

function whereItCameFrom(): HTMLElement {
  return screen.getByRole("region", { name: "Where it came from" });
}

describe("where a Question came from", () => {
  it("shows an Adapted Question's Source on its page", async () => {
    aBankHolding([adapted]);
    renderTheWholeClient(`/questions/${adapted.id}`);

    await screen.findByRole("heading", { level: 1, name: adapted.text });
    expect(within(whereItCameFrom()).getByText(/Adapted/)).toBeVisible();
    expect(
      within(whereItCameFrom()).getByText("Designing Data-Intensive Applications, chapter 3"),
    ).toBeVisible();
  });

  it("says an Adapted Question with no Source named none", async () => {
    const unnamed = { ...adapted, source: null };
    aBankHolding([unnamed]);
    renderTheWholeClient(`/questions/${unnamed.id}`);

    await screen.findByRole("heading", { level: 1, name: unnamed.text });
    expect(within(whereItCameFrom()).getByText("Its Author named no Source.")).toBeVisible();
  });

  it("says where an Inherited Question came from is not known", async () => {
    aBankHolding([inherited]);
    renderTheWholeClient(`/questions/${inherited.id}`);

    await screen.findByRole("heading", { level: 1, name: inherited.text });
    expect(within(whereItCameFrom()).getByText(/Inherited/)).toBeVisible();
    expect(within(whereItCameFrom()).getByText(/Where it came from is not known\./)).toBeVisible();
  });

  it("shows each card's Provenance in the list", async () => {
    aBankHolding([adapted, inherited]);
    renderTheWholeClient("/");

    const cards = await screen.findAllByRole("article");
    expect(cards[0]).toHaveTextContent("Where it came from: Adapted");
    expect(cards[1]).toHaveTextContent("Where it came from: Inherited");
  });
});
