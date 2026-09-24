import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, type FakeApi } from "./helpers/fake-api";
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

const added = aQuestion({
  id: "a0000000-0000-4000-8000-000000000042",
  text: "How would you find a slow query?",
  answerNotes: "Look for EXPLAIN ANALYZE before any guessing.",
  publicationState: "pending",
  tags: [
    { category: "technology", tag: "node" },
    { category: "seniority", tag: "mid" },
  ],
});

/** Takes any addition and answers with `added`, which it then serves on its own page. */
function aBankThatAddsIt(): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (request.method === "POST" && asked.pathname === "/api/questions") {
        return answersWith({ question: added }, 201);
      }
      if (asked.pathname === `/api/questions/${added.id}`) return answersWith({ question: added });
      if (asked.pathname === `/api/questions/${added.id}/history`) {
        return answersWith({ events: [] });
      }
      return undefined;
    },
  );
}

/** The additions the client sent, as the JSON bodies it sent them with. */
async function additionsSent(api: FakeApi): Promise<unknown[]> {
  const additions = api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/questions",
  );
  return Promise.all(additions.map((request) => request.json()));
}

describe("adding a Question", () => {
  it("sends the text, Answer Notes and Tags, then opens the new Question", async () => {
    const api = aBankThatAddsIt();
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("link", { name: "Add a Question" }));
    const questionBox = await screen.findByLabelText("Question");
    await userEvent.type(questionBox, "How would you find a slow query?");
    await userEvent.type(
      screen.getByLabelText("Answer Notes"),
      "Look for EXPLAIN ANALYZE before any guessing.",
    );
    await userEvent.click(await screen.findByRole("checkbox", { name: "node" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "mid" }));
    await userEvent.click(screen.getByRole("button", { name: "Add the Question" }));

    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${added.id}`);
    expect(await additionsSent(api)).toEqual([
      {
        text: "How would you find a slow query?",
        answerNotes: "Look for EXPLAIN ANALYZE before any guessing.",
        provenance: "original",
        tags: [
          { category: "technology", tag: "node" },
          { category: "seniority", tag: "mid" },
        ],
        confirmedNotANearDuplicate: false,
      },
    ]);
  });
});
