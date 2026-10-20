import type { Question, Viewer } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, refusesWith } from "./helpers/fake-api";
import { aPageOf, aQueueOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { itIsNow } from "./helpers/the-clock";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const aReviewer = aViewer({ role: "reviewer" });

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000051",
  text: "What does a database index cost on every write?",
  publicationState: "pending",
});

/** A bank whose Pending list holds `pending`. */
function aBankWaitingOn(pending: Question[]) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/questions/pending" ? aQueueOf(pending, asked) : undefined,
  );
}

async function thePanel() {
  return within(await screen.findByRole("region", { name: "Waiting for your review" }));
}

describe("Waiting for your review on Home", () => {
  it("lists a Pending Question for a Reviewer", async () => {
    signInAs(aReviewer);
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/");

    expect(await (await thePanel()).findByRole("link", { name: waiting.text })).toBeVisible();
  });

  it("names each Question's author and how long it has waited since it was added", async () => {
    itIsNow(new Date(2026, 9, 20, 12, 0));
    signInAs(aReviewer);
    aBankWaitingOn([{ ...waiting, createdAt: new Date(2026, 9, 16, 12, 0).toISOString() }]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const row = within((await panel.findByRole("link", { name: waiting.text })).closest("li")!);
    expect(row.getByText("From author@iqb.test")).toBeVisible();
    expect(row.getByText("Waiting 4 days")).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["an Author", aViewer({ role: "author" })],
    ["an Administrator who is an Author", aViewer({ role: "author", isAdministrator: true })],
  ])("is not shown to %s", async (_who, viewer) => {
    signInAs(viewer);
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Recently added" });
    expect(screen.queryByRole("region", { name: "Waiting for your review" })).toBeNull();
  });

  it("says so when no Question is waiting", async () => {
    signInAs(aReviewer);
    aBankWaitingOn([]);
    renderTheWholeClient("/");

    expect(
      await (await thePanel()).findByText(
        "Nothing is waiting for review. New Questions appear here when an Author sends them.",
      ),
    ).toBeVisible();
  });

  it("says so when the list fails, and leaves the other panels working", async () => {
    signInAs(aReviewer);
    const own = aQuestion({
      id: "a0000000-0000-4000-8000-000000000052",
      text: "How would you explain a race condition to a new joiner?",
      publicationState: "rejected",
      reason: "Ask it about one language.",
    });
    let failing = true;
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname === "/api/questions/own") return aPageOf([own], asked);
        if (asked.pathname !== "/api/questions/pending") return undefined;
        return failing
          ? refusesWith(500, "internal_error", "Something went wrong on our side.")
          : aQueueOf([waiting], asked);
      },
    );
    renderTheWholeClient("/");

    const panel = await thePanel();
    expect(await panel.findByText("The Pending Questions could not be loaded")).toBeVisible();
    const yours = within(
      screen.getByRole("region", { name: "Your Pending and Rejected Questions" }),
    );
    expect(await yours.findByRole("link", { name: own.text })).toBeVisible();

    failing = false;
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(panel.getByRole("link", { name: waiting.text })).toBeVisible());
  });

  it("shows the first five in the queue's order, and leads on to the queue", async () => {
    signInAs(aReviewer);
    const six = Array.from({ length: 6 }, (_, at) =>
      aQuestion({
        id: `a0000000-0000-4000-8000-00000000006${at}`,
        text: `Which trade-off does design number ${at + 1} make?`,
        publicationState: "pending",
      }),
    );
    aBankWaitingOn(six);
    renderTheWholeClient("/");

    const panel = await thePanel();
    await panel.findByRole("link", { name: six[0]!.text });
    expect(panel.getAllByRole("link", { name: /\?$/ }).map((link) => link.textContent)).toEqual(
      six.slice(0, 5).map(({ text }) => text),
    );

    await userEvent.click(panel.getByRole("link", { name: "Open the Review queue" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();
    expect(window.location.pathname).toBe("/review");
  });
});
