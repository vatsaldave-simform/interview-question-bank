import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

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

async function detailsOf(question: { text: string }) {
  await screen.findByRole("heading", { level: 1, name: question.text });
  return within(screen.getByRole("region", { name: "About this Question" }));
}

describe("the Question page", () => {
  it("keeps the Question's details in one place, with the buttons that act on it", async () => {
    aBankHolding([pending]);
    renderTheWholeClient(`/questions/${pending.id}`);

    const details = await detailsOf(pending);
    expect(details.getByText("Pending")).toBeVisible();
    expect(details.getByText("Restricted to Acme")).toBeVisible();
    expect(details.getByRole("region", { name: "Where it came from" })).toBeVisible();
    expect(details.getByRole("link", { name: "Edit" })).toBeVisible();
    expect(details.getByRole("button", { name: "Publish" })).toBeVisible();
    expect(details.getByRole("button", { name: "Reject" })).toBeVisible();
    expect(details.queryByText(pending.answerNotes)).not.toBeInTheDocument();
  });

  it("offers Resubmit with the details, and shows the reason in a section of its own", async () => {
    aBankHolding([rejected]);
    renderTheWholeClient(`/questions/${rejected.id}`);

    const details = await detailsOf(rejected);
    expect(details.getByRole("button", { name: "Resubmit" })).toBeVisible();
    const reason = screen.getByRole("region", { name: "Why it was Rejected" });
    expect(reason).toHaveTextContent("Too easy to tell anyone apart.");
    expect(details.queryByText("Too easy to tell anyone apart.")).not.toBeInTheDocument();
  });
});
