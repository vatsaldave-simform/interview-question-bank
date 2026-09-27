import type { NearDuplicatesFound, Question } from "@iqb/shared";
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

const original = aQuestion({
  id: "a0000000-0000-4000-8000-000000000007",
  text: "What does satisfies do?",
});

/**
 * Refuses an edit as the API does when detection finds a Near-Duplicate in a Published
 * Question's new text, unless it carries the editor's word that it is different.
 */
function aBankThatFindsANearDuplicate(): FakeApi {
  let current: Question = original;
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      if (asked.pathname === `/api/questions/${original.id}/history`) {
        return answersWith({ events: [] });
      }
      if (asked.pathname !== `/api/questions/${original.id}`) return undefined;
      if (request.method === "PATCH") {
        const sent = (await request.clone().json()) as Partial<Question> & {
          confirmedNotANearDuplicate?: boolean;
        };
        if (sent.confirmedNotANearDuplicate !== true) {
          return refusesWith(
            409,
            "conflict",
            "This text closely resembles a Question already in the bank.",
            found,
          );
        }
        current = { ...current, ...(sent.text === undefined ? {} : { text: sent.text }) };
      }
      return answersWith({ question: current });
    },
  );
}

async function editsSent(api: FakeApi): Promise<unknown[]> {
  const edits = api.sent.filter((request) => request.method === "PATCH");
  return Promise.all(edits.map((request) => request.json()));
}

async function rewriteTheText(): Promise<void> {
  renderTheWholeClient(`/questions/${original.id}`);
  await userEvent.click(await screen.findByRole("link", { name: "Edit" }));
  const questionBox = await screen.findByLabelText("Question");
  await userEvent.clear(questionBox);
  await userEvent.type(questionBox, "How would you find a slow query?");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("an edit the API judged a Near-Duplicate", () => {
  it("shows each Near-Duplicate in a dialog", async () => {
    aBankThatFindsANearDuplicate();

    await rewriteTheText();

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("This text closely resembles a Question already in the bank."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "How do you find a slow query in Postgres?" }),
    ).toBeVisible();
  });

  it("sends the same edit again with the editor's word, and shows the Question", async () => {
    const api = aBankThatFindsANearDuplicate();

    await rewriteTheText();
    await userEvent.click(await screen.findByRole("button", { name: "It is different, save it" }));

    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
    const [first, second] = await editsSent(api);
    expect(first).toEqual({ text: "How would you find a slow query?" });
    // The same edit, word for word: the confirmation is about what the editor sent.
    expect(second).toEqual({ ...(first as object), confirmedNotANearDuplicate: true });
  });

  it("goes back to the form without sending anything, with the edit still there", async () => {
    const api = aBankThatFindsANearDuplicate();

    await rewriteTheText();
    await userEvent.click(await screen.findByRole("button", { name: "Change my Question" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toHaveValue("How would you find a slow query?");
    expect(await editsSent(api)).toHaveLength(1);
  });
});
