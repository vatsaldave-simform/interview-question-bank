import type { ChangeEvent, Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aSignedInAuthor, answersWith, type FakeApi } from "./helpers/fake-api";
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

const original = aQuestion({
  id: "a0000000-0000-4000-8000-000000000007",
  text: "What does satisfies do?",
  answerNotes: "It checks a value against a type without widening it.",
  tags: [{ category: "technology", tag: "typescript" }],
});

/** Changes the Question behind the client's back, as another Viewer saving would. */
let editElsewhere: (changes: Partial<Question>) => void = () => {};

/**
 * Holds one Question and changes it the way the API would: the fields an edit names are
 * replaced, and the history gains an event saying so.
 */
function aBankHoldingOneQuestion(): FakeApi {
  let current: Question = original;
  const events: ChangeEvent[] = [];
  editElsewhere = (changes) => {
    current = { ...current, ...changes };
  };
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      if (asked.pathname === `/api/questions/${original.id}/history`) {
        return answersWith({ events });
      }
      if (asked.pathname !== `/api/questions/${original.id}`) return undefined;
      if (request.method === "PATCH") {
        const edit = (await request.clone().json()) as Partial<Question>;
        const before = current;
        current = { ...current, ...edit };
        events.push({
          id: "e0000000-0000-4000-8000-000000000001",
          questionId: original.id,
          viewerId: aSignedInAuthor.viewer.id,
          viewerEmail: aSignedInAuthor.viewer.email,
          at: "2026-09-02T14:30:00.000Z",
          type: "question_edited",
          payload:
            edit.text === undefined ? {} : { text: { before: before.text, after: current.text } },
        });
      }
      return answersWith({ question: current });
    },
  );
}

async function editsSent(api: FakeApi): Promise<unknown[]> {
  const edits = api.sent.filter((request) => request.method === "PATCH");
  return Promise.all(edits.map((request) => request.json()));
}

async function openTheEditForm(): Promise<void> {
  renderTheWholeClient(`/questions/${original.id}`);
  await userEvent.click(await screen.findByRole("link", { name: "Edit" }));
}

const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

describe("editing a Question", () => {
  it("sends only the text it changed, then shows the Question and the edit", async () => {
    const api = aBankHoldingOneQuestion();
    await openTheEditForm();

    const questionBox = await screen.findByLabelText("Question");
    expect(questionBox).toHaveValue("What does satisfies do?");
    await userEvent.clear(questionBox);
    await userEvent.type(questionBox, "What does `satisfies` check?");
    await save();

    expect(
      await screen.findByRole("heading", { name: "What does `satisfies` check?" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${original.id}`);
    expect(await editsSent(api)).toEqual([{ text: "What does `satisfies` check?" }]);

    const history = await screen.findByRole("list", { name: "History" });
    expect(within(history).getByRole("listitem")).toHaveTextContent(
      "author@iqb.test edited this Question",
    );
  });

  it("sends only the Tags when only the Tags changed", async () => {
    const api = aBankHoldingOneQuestion();
    await openTheEditForm();

    await userEvent.click(await screen.findByRole("checkbox", { name: "senior" }));
    await save();

    expect(await screen.findByRole("heading", { name: original.text })).toBeVisible();
    expect(await editsSent(api)).toEqual([
      {
        tags: [
          { category: "technology", tag: "typescript" },
          { category: "seniority", tag: "senior" },
        ],
      },
    ]);
  });

  it("sends nothing when nothing changed, and says so", async () => {
    const api = aBankHoldingOneQuestion();
    await openTheEditForm();

    // Space at the end is trimmed before it is measured, so it is not a change either.
    await userEvent.type(await screen.findByLabelText("Question"), "  ");
    await save();

    expect(
      await screen.findByText("Nothing has changed. Change something before saving."),
    ).toBeVisible();
    expect(await editsSent(api)).toEqual([]);
  });

  it("refuses an emptied field before sending, against that field", async () => {
    const api = aBankHoldingOneQuestion();
    await openTheEditForm();

    await userEvent.clear(await screen.findByLabelText("Answer Notes"));
    await save();

    expect(await screen.findByText("Write what a good answer looks like.")).toBeVisible();
    expect(screen.queryByText(/Nothing has changed/)).not.toBeInTheDocument();
    expect(await editsSent(api)).toEqual([]);
  });

  // The client asks for the Question again whenever the window regains focus, so what it
  // holds can change while the form is open.
  it("compares with the Question as it was opened, not as it was fetched again later", async () => {
    const api = aBankHoldingOneQuestion();
    await openTheEditForm();
    await screen.findByLabelText("Question");

    editElsewhere({ text: "Somebody else's better wording." });
    window.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(
        api.sent.filter((request) => new URL(request.url).pathname.endsWith(original.id)),
      ).toHaveLength(2),
    );

    await userEvent.click(screen.getByRole("checkbox", { name: "senior" }));
    await save();

    await screen.findByRole("heading", { name: "Somebody else's better wording." });
    // Only the Tags: sending the text too would put back the wording just replaced.
    expect(await editsSent(api)).toEqual([
      {
        tags: [
          { category: "technology", tag: "typescript" },
          { category: "seniority", tag: "senior" },
        ],
      },
    ]);
  });
});
