import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { questionPageSize } from "@/features/questions/question-pages.schema";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aReviewer = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000006",
  email: "reviewer@iqb.test",
  role: "reviewer",
});

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(aReviewer);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** Answers the Pending queue as the test says, and everything else the usual way. */
function aBankAnsweringTheQueue(answer: (asked: URL) => Response) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => (asked.pathname === "/api/questions/pending" ? answer(asked) : undefined),
  );
}

describe("the Reviewer's Pending queue", () => {
  it("lists the Pending Questions in the order the API sent them", async () => {
    const waitedLongest = aQuestion({
      id: "a0000000-0000-4000-8000-000000000011",
      text: "When would you choose a queue over a direct call?",
      publicationState: "pending",
    });
    const justAdded = aQuestion({
      id: "a0000000-0000-4000-8000-000000000012",
      text: "How do you tell a slow query from a slow network?",
      publicationState: "pending",
    });
    aBankAnsweringTheQueue((asked) => aPageOf([waitedLongest, justAdded], asked));

    renderTheWholeClient("/review");

    const queue = await screen.findByRole("list", { name: "Pending Questions" });
    const [first, second] = within(queue).getAllByRole("article");
    expect(within(first!).getByRole("link", { name: waitedLongest.text })).toBeVisible();
    expect(within(second!).getByRole("link", { name: justAdded.text })).toBeVisible();
  });

  it("says so when nothing is waiting", async () => {
    aBankAnsweringTheQueue((asked) => aPageOf([], asked));

    renderTheWholeClient("/review");

    expect(await screen.findByText("No Question is waiting for review.")).toBeVisible();
  });

  it("asks for the next page, and the address says which page it is on", async () => {
    const aFullPage = Array.from({ length: questionPageSize }, (_, index) =>
      aQuestion({
        id: `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        text: `Pending number ${index + 1}`,
        publicationState: "pending",
      }),
    );
    const api = aBankAnsweringTheQueue((asked) =>
      aPageOf(asked.searchParams.get("offset") === "0" ? aFullPage : [], asked),
    );
    renderTheWholeClient("/review");
    await screen.findByText("Pending number 1");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("There are no more Pending Questions.")).toBeVisible();
    expect(window.location.search).toBe(`?offset=${questionPageSize}`);
    const asked = api.sent.map((request) => new URL(request.url)).at(-1)!;
    expect(asked.pathname).toBe("/api/questions/pending");
    expect(asked.searchParams.get("offset")).toBe(String(questionPageSize));
  });

  it("reports the API's refusal to a Reader who opens the address, with no Try again", async () => {
    signInAs(aViewer({ role: "reader" }));
    aBankAnsweringTheQueue(() => refusesWith(403, "forbidden", "Only a Reviewer may do that."));

    renderTheWholeClient("/review");

    expect(await screen.findByText("The bank refused to show the Pending Questions")).toBeVisible();
    expect(screen.getByText("Only a Reviewer may do that.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("the link to the Pending queue", () => {
  it("is in the header for a Reviewer, and opens the queue", async () => {
    aBankAnsweringTheQueue((asked) => aPageOf([], asked));
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("link", { name: "Review queue" }));

    expect(await screen.findByRole("heading", { name: "Review queue" })).toBeVisible();
  });

  it.each(["reader", "author"] as const)("is not in the header for a %s", async (role) => {
    signInAs(aViewer({ role }));
    aBankAnsweringTheQueue((asked) => aPageOf([], asked));
    renderTheWholeClient("/");

    await screen.findByRole("heading", { name: "Questions" });

    expect(screen.queryByRole("link", { name: "Review queue" })).not.toBeInTheDocument();
  });
});
