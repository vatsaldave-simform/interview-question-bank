import type { NearDuplicatesFound } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith, type FakeApi } from "./helpers/fake-api";
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

const found: NearDuplicatesFound = {
  nearDuplicates: [
    {
      questionId: "a0000000-0000-4000-8000-000000000002",
      text: "How do you find a slow query in Postgres?",
      similarity: 0.62,
    },
  ],
};

const added = aQuestion({
  id: "a0000000-0000-4000-8000-000000000042",
  text: "How would you find a slow query?",
  publicationState: "pending",
});

/**
 * Refuses an addition as the API does when detection finds a Near-Duplicate, unless it
 * carries the Author's word that the Question is different, in which case it is added.
 */
function aBankThatFindsAMatch(): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (request.method === "POST" && asked.pathname === "/api/questions") {
        const sent = (await request.clone().json()) as { confirmedNotANearDuplicate: boolean };
        return sent.confirmedNotANearDuplicate
          ? answersWith({ question: added }, 201)
          : refusesWith(
              409,
              "conflict",
              "This Question closely resembles one already in the bank.",
              found,
            );
      }
      if (asked.pathname === `/api/questions/${added.id}`) return answersWith({ question: added });
      if (asked.pathname === `/api/questions/${added.id}/history`) {
        return answersWith({ events: [] });
      }
      return undefined;
    },
  );
}

async function additionsSent(api: FakeApi): Promise<unknown[]> {
  const additions = api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/questions",
  );
  return Promise.all(additions.map((request) => request.json()));
}

async function addAQuestion(): Promise<void> {
  const questionBox = await screen.findByLabelText("Question");
  await userEvent.type(questionBox, "How would you find a slow query?");
  await userEvent.type(screen.getByLabelText("Answer Notes"), "Look for EXPLAIN ANALYZE.");
  await userEvent.click(screen.getByRole("button", { name: "Add the Question" }));
}

describe("a Question the API judged a Near-Duplicate", () => {
  it("shows each Near-Duplicate, and how alike it is, in a dialog", async () => {
    aBankThatFindsAMatch();
    renderTheWholeClient("/questions/new");

    await addAQuestion();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("This Question closely resembles one already in the bank."),
    ).toBeVisible();
    const nearDuplicate = within(dialog).getByRole("link", {
      name: "How do you find a slow query in Postgres?",
    });
    // A new tab, so reading a Near-Duplicate does not throw away what is on the form.
    expect(nearDuplicate).toHaveAttribute("target", "_blank");
    expect(within(dialog).getByText("62% alike")).toBeVisible();
  });

  it("sends the same Question again with the Author's word, and opens it", async () => {
    const api = aBankThatFindsAMatch();
    renderTheWholeClient("/questions/new");

    await addAQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "It is different, add it" }));

    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
    const [first, second] = await additionsSent(api);
    expect(first).toMatchObject({ confirmedNotANearDuplicate: false });
    // The same Question, word for word: the confirmation is about what the Author sent.
    expect(second).toEqual({ ...(first as object), confirmedNotANearDuplicate: true });
  });

  it("goes back to the form without sending anything, with the draft still there", async () => {
    const api = aBankThatFindsAMatch();
    renderTheWholeClient("/questions/new");

    await addAQuestion();
    await userEvent.click(await screen.findByRole("button", { name: "Change my Question" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("How would you find a slow query?");
    expect(await additionsSent(api)).toHaveLength(1);
  });
});
