import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, aQuestion, aSignedInAuthor, aViewer, refusesWith } from "./helpers/fake-api";
import { aBankHolding, aPageOf, fakeBank, listRequests, signInAs } from "./helpers/fake-bank";
import { homeGreeting } from "./helpers/home-page";
import { itIsNow } from "./helpers/the-clock";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const newest = aQuestion({
  id: "a0000000-0000-4000-8000-000000000002",
  text: "How does a closure keep a variable alive?",
});
const older = aQuestion();

async function theNewest() {
  return within(await screen.findByRole("region", { name: "Recently added" }));
}

describe("the newest Questions on Home", () => {
  it("are the first five of the whole bank, as Browse lists it", async () => {
    const api = fakeBank((asked) => aPageOf([newest, older], asked));
    renderTheWholeClient("/");

    await (await theNewest()).findByRole("link", { name: newest.text });

    const [asked, ...more] = listRequests(api);
    expect(more).toHaveLength(0);
    expect([...asked!.searchParams.keys()].sort()).toEqual(["limit", "offset"]);
    expect(asked!.searchParams.get("limit")).toBe("5");
    expect(asked!.searchParams.get("offset")).toBe("0");
  });

  it("are only what the API sent, in its order", async () => {
    // The API has already left out what the Viewer may not see, so the page adds nothing.
    fakeBank((asked) => aPageOf([newest, older], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    await panel.findByRole("link", { name: newest.text });
    expect(panel.getAllByRole("link", { name: /\?$/ }).map((link) => link.textContent)).toEqual([
      newest.text,
      older.text,
    ]);
  });

  it("mark one that is not Published with its state", async () => {
    const pending = aQuestion({
      id: "a0000000-0000-4000-8000-000000000004",
      text: "What does a Pending Question wait for?",
      publicationState: "pending",
    });
    fakeBank((asked) => aPageOf([pending, older], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    const rowOf = async (text: string) =>
      within((await panel.findByRole("link", { name: text })).closest("li")!);
    expect((await rowOf(pending.text)).getByText("Pending")).toBeVisible();
    expect((await rowOf(older.text)).queryByText("Published")).not.toBeInTheDocument();
  });

  it("show two Tags, the Client restriction, the Rating and when each was added", async () => {
    itIsNow(new Date(2026, 9, 20, 12, 0));
    const restricted = aQuestion({
      id: "a0000000-0000-4000-8000-000000000005",
      text: "How would you split a table that has outgrown one server?",
      tags: [
        { category: "technology", tag: "node" },
        { category: "seniority", tag: "senior" },
        { category: "question-type", tag: "practical" },
      ],
      client: aClient(),
      rating: { average: 4.6, count: 18, mine: null },
      createdAt: new Date(2026, 9, 18, 12, 0).toISOString(),
    });
    fakeBank((asked) => aPageOf([restricted], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    const row = within((await panel.findByRole("link", { name: restricted.text })).closest("li")!);
    const tags = within(row.getByRole("list", { name: "Tags" })).getAllByRole("listitem");
    expect(tags.map((tag) => tag.textContent)).toEqual(["node", "senior"]);
    expect(row.getByText("Restricted to Northwind Trading")).toBeVisible();
    expect(row.getByText("4.6 out of 5 from 18 Ratings")).toBeVisible();
    expect(row.getByText(/^Added/)).toHaveTextContent("Added 2 days ago");
  });

  it("tell a Reader nothing about who wrote them", async () => {
    signInAs(
      aViewer({
        id: "7c3b4a1e-0000-4000-8000-000000000002",
        email: "reader@iqb.test",
        role: "reader",
      }),
    );
    fakeBank((asked) => aPageOf([older], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    const row = (await panel.findByRole("link", { name: older.text })).closest("li")!;
    expect(row).not.toHaveTextContent(/From /);
    expect(row).not.toHaveTextContent(aSignedInAuthor.viewer.email);
    expect(row).not.toHaveTextContent(older.authorId);
  });

  it("each open their own page", async () => {
    aBankHolding([newest, older]);
    renderTheWholeClient("/");

    await userEvent.click(await (await theNewest()).findByRole("link", { name: older.text }));

    expect(await screen.findByRole("heading", { level: 1, name: older.text })).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${older.id}`);
  });

  it("lead on to Browse for the rest of the bank", async () => {
    fakeBank((asked) => aPageOf([newest], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    await userEvent.click(await panel.findByRole("link", { name: "See them all in Browse" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Browse" })).toBeVisible();
    expect(window.location.pathname).toBe("/questions");
  });

  it("say so when the bank is empty", async () => {
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/");

    const panel = await theNewest();
    expect(await panel.findByText("Nothing has been added to the bank yet.")).toBeVisible();
  });

  it("say so when the list fails, and leave the rest of Home in place", async () => {
    let failing = true;
    fakeBank((asked) =>
      failing
        ? refusesWith(500, "internal_error", "Something went wrong on our side.")
        : aPageOf([newest], asked),
    );
    renderTheWholeClient("/");

    const panel = await theNewest();
    expect(await panel.findByText("The newest Questions could not be loaded")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: homeGreeting })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeVisible();

    failing = false;
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(panel.getByRole("link", { name: newest.text })).toBeVisible());
  });
});
