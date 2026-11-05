import type { Question, UpvoteSummary } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith, type FakeApi } from "./helpers/fake-api";
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

const published = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "When would you reach for a queue?",
  upvotes: { count: 2, mine: false },
});

/** Keeps each Upvote it takes, so the list asked for afterwards shows it too. */
function aBankUpvoting(
  question: Question,
  answer: (give: boolean) => Response | UpvoteSummary = (give) => ({
    count: question.upvotes.count + (give ? 1 : 0),
    mine: give,
  }),
): FakeApi {
  let current = question;
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      const path = `/api/questions/${question.id}`;
      if (asked.pathname === `${path}/upvote`) {
        const summary = answer(request.method === "PUT");
        if (summary instanceof Response) return summary;
        current = { ...current, upvotes: summary };
        return answersWith({ upvotes: summary });
      }
      if (asked.pathname === path) return answersWith({ question: current });
      if (asked.pathname === `${path}/history`) return answersWith({ events: [] });
      return undefined;
    },
  );
}

function methodsSent(api: FakeApi): string[] {
  return api.sent
    .filter((request) => new URL(request.url).pathname.endsWith("/upvote"))
    .map((request) => request.method);
}

function asked(api: FakeApi, pathname: string): number {
  return api.sent.filter((request) => new URL(request.url).pathname === pathname).length;
}

async function openThePageOf(question: Question): Promise<void> {
  renderTheWholeClient(`/questions/${question.id}`);
  await screen.findByRole("heading", { level: 1, name: question.text });
}

const theUpvoteButton = () => screen.getByRole("button", { name: "Upvote" });
const upvotesSection = () => within(screen.getByRole("region", { name: "Upvotes" }));

describe("upvoting a Question", () => {
  it("gives the Upvote and shows the count the API answered with, pressed", async () => {
    const api = aBankUpvoting(published);
    await openThePageOf(published);

    expect(upvotesSection().getByText("2 Upvotes")).toBeInTheDocument();
    expect(theUpvoteButton()).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(theUpvoteButton());

    expect(await upvotesSection().findByText("3 Upvotes, including yours")).toBeInTheDocument();
    expect(theUpvoteButton()).toHaveAttribute("aria-pressed", "true");
    expect(methodsSent(api)).toEqual(["PUT"]);
  });

  it("takes the Upvote back when the Viewer already gave one", async () => {
    const upvoted = { ...published, upvotes: { count: 3, mine: true } };
    const api = aBankUpvoting(upvoted, () => ({ count: 2, mine: false }));
    await openThePageOf(upvoted);

    expect(theUpvoteButton()).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(theUpvoteButton());

    expect(await upvotesSection().findByText("2 Upvotes")).toBeInTheDocument();
    expect(theUpvoteButton()).toHaveAttribute("aria-pressed", "false");
    expect(methodsSent(api)).toEqual(["DELETE"]);
  });

  it("upvotes by keyboard alone", async () => {
    const api = aBankUpvoting(published);
    await openThePageOf(published);

    theUpvoteButton().focus();
    await userEvent.keyboard("{Enter}");

    expect(await upvotesSection().findByText("3 Upvotes, including yours")).toBeInTheDocument();
    expect(methodsSent(api)).toEqual(["PUT"]);
  });

  it("shows the API's refusal, and leaves the button as it was", async () => {
    aBankUpvoting(published, () =>
      refusesWith(409, "conflict", "Only a Published Question can be upvoted."),
    );
    await openThePageOf(published);

    await userEvent.click(theUpvoteButton());

    expect(await screen.findByText("Your Upvote was not saved.")).toBeVisible();
    expect(screen.getByText("Only a Published Question can be upvoted.")).toBeVisible();
    expect(theUpvoteButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a Published Question nobody has upvoted with the button and 0", async () => {
    const nobody = { ...published, upvotes: { count: 0, mine: false } };
    aBankUpvoting(nobody);
    await openThePageOf(nobody);

    expect(theUpvoteButton()).toBeVisible();
    expect(upvotesSection().getByText("0 Upvotes")).toBeInTheDocument();
  });

  it("shows no Upvotes at all on a Question that was never Published", async () => {
    const pending = {
      ...published,
      publicationState: "pending" as const,
      upvotes: { count: 0, mine: false },
    };
    aBankUpvoting(pending, () => refusesWith(500, "internal_error", "Not expected."));
    await openThePageOf(pending);

    expect(screen.queryByRole("region", { name: "Upvotes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument();
  });

  it("shows the Upvotes a returned Question kept, with no button", async () => {
    const returned = { ...published, publicationState: "rejected" as const, reason: "Too vague." };
    aBankUpvoting(returned, () => refusesWith(500, "internal_error", "Not expected."));
    await openThePageOf(returned);

    expect(upvotesSection().getByText("2 Upvotes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument();
  });

  // An Upvote changes nothing else about the Question and writes no Change Event (ADR-0053).
  it("asks for nothing again, and the card shows the count coloured", async () => {
    const api = aBankUpvoting(published);
    await openThePageOf(published);
    const path = `/api/questions/${published.id}`;
    const questionAsked = asked(api, path);
    const historyAsked = asked(api, `${path}/history`);

    await userEvent.click(theUpvoteButton());
    await upvotesSection().findByText("3 Upvotes, including yours");

    expect(asked(api, path)).toBe(questionAsked);
    expect(asked(api, `${path}/history`)).toBe(historyAsked);

    const trail = within(screen.getByRole("navigation", { name: "breadcrumb" }));
    await userEvent.click(trail.getByRole("link", { name: "Browse" }));
    const [card] = await screen.findAllByRole("article");
    const count = await within(card!).findByText("3 Upvotes, including yours");
    expect(count.closest("p")).toHaveClass("text-brand-action");
    expect(within(card!).queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument();
  });
});
