import type { Question, Viewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, type FakeApi } from "./helpers/fake-api";
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

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "What does a database index cost on every write?",
  publicationState: "pending",
});

/** A bank whose Pending list holds `pending`, and which takes each Published one out of it. */
function aBankWaitingOn(pending: Question[]): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (asked.pathname === "/api/questions/pending") return aPageOf(pending, asked);
      const published = /^\/api\/questions\/([^/]+)\/publish$/.exec(asked.pathname);
      if (published === null || request.method !== "POST") return undefined;
      const moved = pending.find(({ id }) => id === published[1]);
      if (moved === undefined) throw new Error(`The Pending list does not hold ${published[1]}.`);
      pending.splice(pending.indexOf(moved), 1);
      return answersWith({ question: { ...moved, publicationState: "published" } });
    },
  );
}

async function theSidebar() {
  return within(await screen.findByRole("navigation", { name: "Main menu" }));
}

function pendingListRequests(api: FakeApi): Request[] {
  return api.sent.filter((request) => new URL(request.url).pathname === "/api/questions/pending");
}

describe("the dot on Review queue", () => {
  it("shows when a Pending Question is waiting, and says so to a screen reader", async () => {
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    expect(
      await sidebar.findByRole("link", { name: "Review queue, Pending Questions waiting" }),
    ).toBeVisible();
  });

  it("does not show when nothing is waiting", async () => {
    const api = aBankWaitingOn([]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await vi.waitFor(() => expect(pendingListRequests(api)).toHaveLength(1));
    await screen.findByText("No Questions match.");
    expect(sidebar.getByRole("link", { name: "Review queue" })).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["an Author", aViewer({ role: "author" })],
    ["an Administrator who is not a Reviewer", aViewer({ role: "author", isAdministrator: true })],
  ])("is not asked for by %s", async (_who, viewer) => {
    signInAs(viewer);
    const api = aBankWaitingOn([waiting]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Browse" });
    await screen.findByText("No Questions match.");
    expect(pendingListRequests(api)).toHaveLength(0);
  });

  it("clears without a reload when the last waiting Question is Published", async () => {
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/review");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Review queue, Pending Questions waiting" });
    const queue = await screen.findByRole("list", { name: "Pending Questions" });
    await userEvent.click(within(queue).getByRole("button", { name: "Publish" }));

    expect(await sidebar.findByRole("link", { name: "Review queue" })).toBeVisible();
  });
});
