import type { Question, RatingSummary } from "@iqb/shared";
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

/** Someone else's, since the API refuses an Author rating their own. */
const someoneElses = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "When would you reach for a queue?",
  authorId: "7c3b4a1e-0000-4000-8000-000000000009",
});

/** Keeps each Rating it takes, so the list asked for afterwards shows it too. */
function aBankRating(
  question: Question,
  ratingAfter: (value: number) => Response | RatingSummary,
): FakeApi {
  let current = question;
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      const path = `/api/questions/${question.id}`;
      if (request.method === "PUT" && asked.pathname === `${path}/rating`) {
        const { value } = (await request.json()) as { value: number };
        const answer = ratingAfter(value);
        if (answer instanceof Response) return answer;
        current = { ...current, rating: answer };
        return answersWith({ rating: answer });
      }
      if (asked.pathname === path) return answersWith({ question: current });
      if (asked.pathname === `${path}/history`) return answersWith({ events: [] });
      return undefined;
    },
  );
}

async function ratingsSent(api: FakeApi): Promise<unknown[]> {
  const ratings = api.sent.filter((request) => request.method === "PUT");
  return Promise.all(ratings.map((request) => request.json()));
}

function asked(api: FakeApi, pathname: string): number {
  return api.sent.filter((request) => new URL(request.url).pathname === pathname).length;
}

async function openThePageOf(question: Question): Promise<void> {
  renderTheWholeClient(`/questions/${question.id}`);
  await screen.findByRole("heading", { level: 1, name: question.text });
}

const yourRating = () => screen.getByRole("group", { name: "Your Rating" });
const theButtonFor = (value: number) =>
  within(yourRating()).getByRole("button", { name: `${value} out of 5` });

describe("rating a Question", () => {
  it("sends the Rating and shows the summary the API answered with, with yours pressed", async () => {
    const api = aBankRating(someoneElses, (value) => ({ average: value, count: 1, mine: value }));
    await openThePageOf(someoneElses);

    expect(theButtonFor(4)).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(theButtonFor(4));

    expect(await screen.findByText("4.0 out of 5 from 1 Rating")).toBeVisible();
    expect(theButtonFor(4)).toHaveAttribute("aria-pressed", "true");
    expect(await ratingsSent(api)).toEqual([{ value: 4 }]);
  });

  it("changes a Rating the Viewer already gave", async () => {
    const rated = { ...someoneElses, rating: { average: 4, count: 3, mine: 4 } };
    const api = aBankRating(rated, (value) => ({ average: (8 + value) / 3, count: 3, mine: value }));
    await openThePageOf(rated);

    expect(theButtonFor(4)).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(theButtonFor(2));

    expect(await screen.findByText("3.3 out of 5 from 3 Ratings")).toBeVisible();
    expect(theButtonFor(2)).toHaveAttribute("aria-pressed", "true");
    expect(theButtonFor(4)).toHaveAttribute("aria-pressed", "false");
    expect(await ratingsSent(api)).toEqual([{ value: 2 }]);
  });

  // Whether this Viewer may rate is the API's answer, as it is for Edit (ADR-0002).
  it("shows the API's refusal when an Author rates their own Question", async () => {
    const own = aQuestion();
    aBankRating(own, () => refusesWith(403, "forbidden", "You cannot rate your own Question."));
    await openThePageOf(own);

    await userEvent.click(theButtonFor(5));

    expect(await screen.findByText("Your Rating was not saved.")).toBeVisible();
    expect(screen.getByText("You cannot rate your own Question.")).toBeVisible();
    expect(theButtonFor(5)).toHaveAttribute("aria-pressed", "false");
  });

  it("offers no Rating on a Pending Question", async () => {
    const pending = { ...someoneElses, publicationState: "pending" as const };
    aBankRating(pending, () => refusesWith(500, "internal_error", "Not expected."));
    await openThePageOf(pending);

    expect(screen.queryByRole("group", { name: "Your Rating" })).not.toBeInTheDocument();
  });

  // A Rating changes nothing else about the Question and writes no Change Event (ADR-0043).
  it("asks for neither the Question nor its history again, and the list shows the Rating", async () => {
    const api = aBankRating(someoneElses, (value) => ({ average: value, count: 1, mine: value }));
    await openThePageOf(someoneElses);
    const path = `/api/questions/${someoneElses.id}`;
    const questionAsked = asked(api, path);
    const historyAsked = asked(api, `${path}/history`);

    await userEvent.click(theButtonFor(3));
    await screen.findByText("3.0 out of 5 from 1 Rating");

    expect(asked(api, path)).toBe(questionAsked);
    expect(asked(api, `${path}/history`)).toBe(historyAsked);

    await userEvent.click(screen.getByRole("link", { name: "← All Questions" }));
    const [card] = await screen.findAllByRole("article");
    expect(await within(card!).findByText("3.0 out of 5 from 1 Rating")).toBeVisible();
  });
});
