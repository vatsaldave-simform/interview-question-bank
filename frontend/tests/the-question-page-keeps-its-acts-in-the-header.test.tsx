import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aReviewer = aViewer({ role: "reviewer" });

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const pending = aQuestion({
  id: "a0000000-0000-4000-8000-000000000031",
  text: "How would you migrate this client's reporting pipeline?",
  answerNotes: "Listen for how they would run the old and new side by side.",
  publicationState: "pending",
  client: { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" },
  provenance: "adapted",
  source: "Designing Data-Intensive Applications",
});

const rejected = aQuestion({
  id: "a0000000-0000-4000-8000-000000000032",
  text: "What is 2 + 2?",
  publicationState: "rejected",
  reason: "Too easy to tell anyone apart.",
});

const published = aQuestion({
  id: "a0000000-0000-4000-8000-000000000033",
  text: "What does `satisfies` check?",
});

async function detailsOf(question: { text: string }) {
  await screen.findByRole("heading", { level: 1, name: question.text });
  return within(screen.getByRole("region", { name: "About this Question" }));
}

const theActs = () =>
  within(screen.getByRole("group", { name: "What you can do with this Question" }));

describe("the Question page", () => {
  it("keeps the Question's details in the side card, and the acts out of it", async () => {
    signInAs(aReviewer);
    aBankHolding([pending]);
    renderTheWholeClient(`/questions/${pending.id}`);

    const details = await detailsOf(pending);
    expect(details.getByText("Pending")).toBeVisible();
    expect(
      details.getByText("Only Viewers with a Grant for Acme can see this Question."),
    ).toBeVisible();
    expect(details.getByRole("region", { name: "Where it came from" })).toBeVisible();
    expect(details.queryByText(pending.answerNotes)).not.toBeInTheDocument();
    expect(details.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(details.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("puts the acts on a Pending Question in the header", async () => {
    signInAs(aReviewer);
    aBankHolding([pending]);
    renderTheWholeClient(`/questions/${pending.id}`);

    await detailsOf(pending);
    expect(theActs().getByRole("link", { name: "Edit" })).toBeVisible();
    expect(theActs().getByRole("button", { name: "Publish" })).toBeVisible();
    expect(theActs().getByRole("button", { name: "Reject" })).toBeVisible();
  });

  it("shows the Tags and the Client restriction with the Answer Notes", async () => {
    aBankHolding([pending]);
    renderTheWholeClient(`/questions/${pending.id}`);

    await detailsOf(pending);
    const notes = within(screen.getByRole("region", { name: "Answer Notes" }));
    expect(notes.getByText(pending.answerNotes)).toBeVisible();
    expect(notes.getByText("Restricted to Acme")).toBeVisible();
  });

  it("offers Return to its Author, with Your Rating and History in the side card", async () => {
    signInAs(aReviewer);
    aBankHolding([published]);
    renderTheWholeClient(`/questions/${published.id}`);

    const details = await detailsOf(published);
    expect(details.getByText("Published")).toBeVisible();
    expect(details.getByRole("group", { name: "Your Rating" })).toBeVisible();
    expect(details.getByRole("region", { name: "History" })).toBeVisible();
    expect(theActs().getByRole("button", { name: "Return to its Author" })).toBeVisible();
  });

  it("offers Resubmit, and shows the reason in a section of its own", async () => {
    aBankHolding([rejected]);
    renderTheWholeClient(`/questions/${rejected.id}`);

    const details = await detailsOf(rejected);
    expect(theActs().getByRole("button", { name: "Resubmit" })).toBeVisible();
    const reason = screen.getByRole("region", { name: "Why it was Rejected" });
    expect(reason).toHaveTextContent("Too easy to tell anyone apart.");
    expect(details.queryByText("Too easy to tell anyone apart.")).not.toBeInTheDocument();
  });
});
