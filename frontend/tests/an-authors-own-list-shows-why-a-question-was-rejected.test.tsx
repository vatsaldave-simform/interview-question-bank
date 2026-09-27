import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, refusesWith } from "./helpers/fake-api";
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

/** Answers the Author's own list, and one Question by id, as the test says. */
function aBankAnswering(answerTheOwnList: (asked: URL) => Response, oneQuestion?: Response) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => {
      if (asked.pathname === "/api/questions/own") return answerTheOwnList(asked);
      if (oneQuestion !== undefined && asked.pathname.startsWith("/api/questions/a0")) {
        return oneQuestion;
      }
      return undefined;
    },
  );
}

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "How would you explain a race condition to a new joiner?",
  publicationState: "pending",
});

const rejected = aQuestion({
  id: "a0000000-0000-4000-8000-000000000022",
  text: "What is 2 + 2?",
  publicationState: "rejected",
  reason: "Too easy to tell anyone anything about the candidate.",
});

describe("an Author's own Pending and Rejected Questions", () => {
  it("lists each Question with its Publication State, and a Rejected one with its reason", async () => {
    aBankAnswering((asked) => aPageOf([waiting, rejected], asked));

    renderTheWholeClient("/questions/own");

    const list = await screen.findByRole("list", { name: "Your Questions" });
    const [first, second] = within(list).getAllByRole("article");
    expect(within(first!).getByRole("link", { name: waiting.text })).toBeVisible();
    expect(within(first!).getByText("Pending")).toBeVisible();
    expect(within(second!).getByRole("link", { name: rejected.text })).toBeVisible();
    expect(within(second!).getByText("Rejected")).toBeVisible();
    expect(within(second!).getByText(rejected.reason!)).toBeVisible();
  });

  it("shows the reason a Question was returned from the bank", async () => {
    // A returned Question is Rejected, carrying the reason it was returned (CONTEXT.md).
    const returned = aQuestion({
      id: "a0000000-0000-4000-8000-000000000023",
      text: "Walk me through the intake flow you built for us.",
      publicationState: "rejected",
      reason: "This names the client's own system. Restrict it to that Client and resubmit.",
    });
    aBankAnswering((asked) => aPageOf([returned], asked));

    renderTheWholeClient("/questions/own");

    const list = await screen.findByRole("list", { name: "Your Questions" });
    expect(within(list).getByText(returned.reason!)).toBeVisible();
  });

  it("says so when the Author has nothing Pending and nothing Rejected", async () => {
    aBankAnswering((asked) => aPageOf([], asked));

    renderTheWholeClient("/questions/own");

    expect(
      await screen.findByText("You have no Pending or Rejected Question."),
    ).toBeVisible();
  });

  it("reports the API's refusal to a Reader who opens the address, with no Try again", async () => {
    signInAs(aViewer({ role: "reader" }));
    aBankAnswering(() => refusesWith(403, "forbidden", "Only an Author may do that."));

    renderTheWholeClient("/questions/own");

    expect(await screen.findByText("The bank refused to show the Questions")).toBeVisible();
    expect(screen.getByText("Only an Author may do that.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("a Rejected Question's own page", () => {
  it("shows the reason it was Rejected", async () => {
    aBankAnswering((asked) => aPageOf([], asked), answersWith({ question: rejected }));

    renderTheWholeClient(`/questions/${rejected.id}`);

    expect(await screen.findByText(rejected.reason!)).toBeVisible();
  });
});

describe("the link to an Author's own list", () => {
  it.each(["author", "reviewer"] as const)(
    "is in the header for a %s, and opens the list",
    async (role) => {
      signInAs(aViewer({ role }));
      aBankAnswering((asked) => aPageOf([], asked));
      renderTheWholeClient("/");

      await userEvent.click(await screen.findByRole("link", { name: "Your Questions" }));

      expect(await screen.findByRole("heading", { name: "Your Questions" })).toBeVisible();
    },
  );

  it("is not in the header for a Reader", async () => {
    signInAs(aViewer({ role: "reader" }));
    aBankAnswering((asked) => aPageOf([], asked));
    renderTheWholeClient("/");

    await screen.findByRole("heading", { name: "Questions" });

    expect(screen.queryByRole("link", { name: "Your Questions" })).not.toBeInTheDocument();
  });
});
