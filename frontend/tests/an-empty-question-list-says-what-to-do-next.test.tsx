import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer } from "./helpers/fake-api";
import { aPageOf, fakeBank, listRequests, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** The empty list alone, so the sidebar's links and the page buttons are not counted. */
async function theEmptyList(saying: string) {
  return screen.findByRole("region", { name: saying });
}

describe("an empty Your Questions", () => {
  it("says so, and offers Add a Question", async () => {
    signInAs();
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/questions/own");

    const empty = within(await theEmptyList("You have no Questions waiting or refused"));
    expect(
      empty.getByText("Questions you add show here until a Reviewer Publishes them."),
    ).toBeVisible();
    await userEvent.click(empty.getByRole("link", { name: "Add a Question" }));
    expect(window.location.pathname).toBe("/questions/new");
  });
});

describe("an empty Review queue", () => {
  it("says nothing is waiting, and offers no act", async () => {
    signInAs(aViewer({ role: "reviewer" }));
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/review");

    const empty = within(await theEmptyList("Nothing is waiting for review"));
    expect(
      empty.getByText("You are done for now. New Questions appear here when an Author sends them."),
    ).toBeVisible();
    expect(empty.queryByRole("button")).not.toBeInTheDocument();
    expect(empty.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("Browse with a filter that matches nothing", () => {
  it("says so, and clearing the filter shows the whole bank", async () => {
    signInAs();
    const question = aQuestion();
    const isTheWholeBank = (asked: URL) =>
      !asked.searchParams.has("technology") && !asked.searchParams.has("keywords");
    // Only the whole bank holds anything, so the filter matches nothing.
    const api = fakeBank((asked) => aPageOf(isTheWholeBank(asked) ? [question] : [], asked));
    renderTheWholeClient("/questions?technology=react&keywords=closures");

    const empty = within(await theEmptyList("No Question matches this filter"));
    expect(
      empty.getByText("Try fewer Tags or words, or clear the filter to see every Question you can see."),
    ).toBeVisible();
    await userEvent.click(empty.getByRole("button", { name: "Clear the filter" }));

    expect(await screen.findByText(question.text)).toBeVisible();
    expect(window.location.search).toBe("");
    const lastAsked = listRequests(api).at(-1);
    expect(lastAsked !== undefined && isTheWholeBank(lastAsked)).toBe(true);
  });
});

describe("Browse with no filter, when the bank is empty", () => {
  it("says so, and offers Add a Question to a Viewer who may add one", async () => {
    signInAs();
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/questions");

    const empty = within(await theEmptyList("The bank has no Questions yet"));
    expect(
      empty.getByText("Add the first one. A Reviewer reads it before it is in the bank."),
    ).toBeVisible();
    expect(empty.getByRole("link", { name: "Add a Question" })).toBeVisible();
  });

  it("says so to a Reader, and offers them nothing to do", async () => {
    signInAs(aViewer({ role: "reader" }));
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/questions");

    const empty = within(await theEmptyList("The bank has no Questions yet"));
    expect(empty.getByText("Questions appear here once a Reviewer Publishes them.")).toBeVisible();
    expect(empty.queryByRole("link")).not.toBeInTheDocument();
  });
});
