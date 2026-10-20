import type { Viewer } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
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

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000031",
  text: "How would you explain a race condition to a new joiner?",
  publicationState: "pending",
});

const rejected = aQuestion({
  id: "a0000000-0000-4000-8000-000000000032",
  text: "What is 2 + 2?",
  publicationState: "rejected",
  reason: "Too easy to tell anyone anything about the candidate.",
});

/** A bank whose own list for the Viewer holds `own`. */
function aBankWithOwn(own: Parameters<typeof aPageOf>[0]) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/questions/own" ? aPageOf(own, asked) : undefined,
  );
}

async function thePanel() {
  return within(await screen.findByRole("region", { name: "Your Pending and Rejected Questions" }));
}

describe("Your Pending and Rejected Questions on Home", () => {
  it("lists an Author's own Pending Question with its state", async () => {
    signInAs(aViewer({ role: "author" }));
    aBankWithOwn([waiting]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const row = within((await panel.findByRole("link", { name: waiting.text })).closest("li")!);
    expect(row.getByText("Pending")).toBeVisible();
  });

  it("says when each was added", async () => {
    itIsNow(new Date(2026, 9, 20, 12, 0));
    signInAs(aViewer({ role: "author" }));
    aBankWithOwn([{ ...waiting, createdAt: new Date(2026, 9, 17, 12, 0).toISOString() }]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const row = within((await panel.findByRole("link", { name: waiting.text })).closest("li")!);
    expect(row.getByText(/^Added/)).toHaveTextContent("Added 3 days ago");
  });

  it("shows why a Rejected one was refused", async () => {
    signInAs(aViewer({ role: "author" }));
    aBankWithOwn([rejected]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const row = within((await panel.findByRole("link", { name: rejected.text })).closest("li")!);
    expect(row.getByText("Rejected")).toBeVisible();
    expect(row.getByText(rejected.reason!)).toBeVisible();
  });

  it("is shown to a Reviewer too", async () => {
    signInAs(aViewer({ role: "reviewer" }));
    aBankWithOwn([waiting]);
    renderTheWholeClient("/");

    expect(await (await thePanel()).findByRole("link", { name: waiting.text })).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["an Administrator who is a Reader", aViewer({ role: "reader", isAdministrator: true })],
  ])("is not shown to %s, and their own list is never asked for", async (_who, viewer) => {
    signInAs(viewer);
    const api = aBankWithOwn([waiting]);
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Recently added" });
    expect(
      screen.queryByRole("region", { name: "Your Pending and Rejected Questions" }),
    ).toBeNull();
    expect(api.sent.map(({ url }) => new URL(url).pathname)).not.toContain("/api/questions/own");
  });

  it("says so when nothing of the Viewer's is waiting", async () => {
    signInAs(aViewer({ role: "author" }));
    aBankWithOwn([]);
    renderTheWholeClient("/");

    expect(
      await (await thePanel()).findByText(
        "Nothing of yours is Pending or Rejected. When you add a Question, you can follow it here.",
      ),
    ).toBeVisible();
  });

  it("says so when the list fails, and leaves the rest of Home working", async () => {
    signInAs(aViewer({ role: "author" }));
    const newest = aQuestion({ text: "What does a closure keep alive?" });
    let failing = true;
    fakeBank(
      (asked) => aPageOf([newest], asked),
      (_request, asked) => {
        if (asked.pathname !== "/api/questions/own") return undefined;
        return failing
          ? refusesWith(500, "internal_error", "Something went wrong on our side.")
          : aPageOf([waiting], asked);
      },
    );
    renderTheWholeClient("/");

    const panel = await thePanel();
    expect(await panel.findByText("The Questions you added could not be loaded")).toBeVisible();
    const recentlyAdded = within(screen.getByRole("region", { name: "Recently added" }));
    expect(await recentlyAdded.findByRole("link", { name: newest.text })).toBeVisible();

    failing = false;
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(panel.getByRole("link", { name: waiting.text })).toBeVisible());
  });

  it("opens a Question's own page from its row", async () => {
    signInAs(aViewer({ role: "author" }));
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname === "/api/questions/own") return aPageOf([waiting], asked);
        if (asked.pathname === `/api/questions/${waiting.id}`) {
          return answersWith({ question: waiting });
        }
        if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
        return undefined;
      },
    );
    renderTheWholeClient("/");

    await userEvent.click(await (await thePanel()).findByRole("link", { name: waiting.text }));
    expect(await screen.findByRole("heading", { level: 1, name: waiting.text })).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${waiting.id}`);
  });

  it("shows the first five of Your Questions, and leads on to the rest", async () => {
    signInAs(aViewer({ role: "author" }));
    const six = Array.from({ length: 6 }, (_, at) =>
      aQuestion({
        id: `a0000000-0000-4000-8000-00000000004${at}`,
        text: `Which trade-off does design number ${at + 1} make?`,
        publicationState: "pending",
      }),
    );
    aBankWithOwn(six);
    renderTheWholeClient("/");

    const panel = await thePanel();
    await panel.findByRole("link", { name: six[0]!.text });
    expect(panel.getAllByRole("link", { name: /\?$/ }).map((link) => link.textContent)).toEqual(
      six.slice(0, 5).map(({ text }) => text),
    );

    await userEvent.click(panel.getByRole("link", { name: "See them all" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Your Questions" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/questions/own");
  });
});
