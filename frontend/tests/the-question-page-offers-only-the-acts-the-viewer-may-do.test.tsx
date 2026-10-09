import type { Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const somebodyElse = "7c3b4a1e-0000-4000-8000-000000000009";

const ownPending = aQuestion({
  id: "a0000000-0000-4000-8000-000000000041",
  text: "How would you find a slow query?",
  publicationState: "pending",
});

const othersPublished = aQuestion({
  id: "a0000000-0000-4000-8000-000000000042",
  text: "When would you reach for a database transaction?",
  authorId: somebodyElse,
});

const othersRejected = aQuestion({
  id: "a0000000-0000-4000-8000-000000000043",
  text: "What is 2 + 2?",
  authorId: somebodyElse,
  publicationState: "rejected",
  reason: "Too easy.",
});

async function actsOn(question: Question) {
  await screen.findByRole("heading", { level: 1, name: question.text });
  const details = within(screen.getByRole("region", { name: "About this Question" }));
  return {
    links: details.queryAllByRole("link").map((link) => link.textContent),
    buttons: details.queryAllByRole("button").map((button) => button.textContent),
  };
}

describe("the acts on the Question page", () => {
  it("offers a Reader none", async () => {
    signInAs(aViewer({ role: "reader" }));
    aBankHolding([othersPublished]);
    renderTheWholeClient(`/questions/${othersPublished.id}`);

    expect(await actsOn(othersPublished)).toEqual({ links: [], buttons: [] });
  });

  it("offers an Author Edit and Reject on their own Pending Question, but not Publish", async () => {
    signInAs();
    aBankHolding([ownPending]);
    renderTheWholeClient(`/questions/${ownPending.id}`);

    expect(await actsOn(ownPending)).toEqual({ links: ["Edit"], buttons: ["Reject"] });
  });

  it("offers an Author none on a Question somebody else wrote", async () => {
    signInAs();
    aBankHolding([othersPublished]);
    renderTheWholeClient(`/questions/${othersPublished.id}`);

    expect(await actsOn(othersPublished)).toEqual({ links: [], buttons: [] });
  });

  it("offers a Reviewer Edit but not Resubmit on somebody else's Rejected Question", async () => {
    signInAs(aViewer({ role: "reviewer" }));
    aBankHolding([othersRejected]);
    renderTheWholeClient(`/questions/${othersRejected.id}`);

    expect(await actsOn(othersRejected)).toEqual({ links: ["Edit"], buttons: [] });
  });
});
