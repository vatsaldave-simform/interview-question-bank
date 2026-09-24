import type { ChangeEvent } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith } from "./helpers/fake-api";
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

const question = aQuestion({ id: "a0000000-0000-4000-8000-000000000007" });

const added: ChangeEvent = {
  id: "e0000000-0000-4000-8000-000000000001",
  questionId: question.id,
  viewerId: "7c3b4a1e-0000-4000-8000-000000000001",
  viewerEmail: "author@iqb.test",
  at: "2026-09-01T09:00:00.000Z",
  type: "question_added",
  payload: {
    text: question.text,
    answerNotes: question.answerNotes,
    provenance: "original",
    source: null,
    tags: question.tags,
  },
};

const edited: ChangeEvent = {
  id: "e0000000-0000-4000-8000-000000000002",
  questionId: question.id,
  viewerId: "7c3b4a1e-0000-4000-8000-000000000003",
  viewerEmail: "reviewer@iqb.test",
  at: "2026-09-02T14:30:00.000Z",
  type: "question_edited",
  payload: {
    text: { before: "What does satisfies do?", after: "What does `satisfies` check?" },
    tags: {
      before: [{ category: "technology", tag: "typescript" }],
      after: [
        { category: "technology", tag: "typescript" },
        { category: "seniority", tag: "mid" },
      ],
    },
  },
};

/** The Question answers as itself, and its history answers as the test says. */
function aBankWhoseHistoryIs(history: () => Response): void {
  fakeBank(
    (asked) => aPageOf([question], asked),
    (_request, asked) => {
      if (asked.pathname === `/api/questions/${question.id}`) return answersWith({ question });
      if (asked.pathname === `/api/questions/${question.id}/history`) return history();
      return undefined;
    },
  );
}

/** Each event in the history, as the list item a person reads. */
async function historyEntries(): Promise<HTMLElement[]> {
  const history = await screen.findByRole("list", { name: "History" });
  return within(history).getAllByRole("listitem");
}

describe("a Question's history", () => {
  it("says who added the Question and when", async () => {
    aBankWhoseHistoryIs(() => answersWith({ events: [added] }));

    renderTheWholeClient(`/questions/${question.id}`);

    const [entry] = await historyEntries();
    expect(entry).toHaveTextContent("author@iqb.test added this Question");
    // The words depend on the browser's language and time zone; the moment does not.
    expect(within(entry!).getByRole("time")).toHaveAttribute("datetime", added.at);
  });

  it("says what an edit changed, as it was and as it became, after the addition", async () => {
    aBankWhoseHistoryIs(() => answersWith({ events: [added, edited] }));

    renderTheWholeClient(`/questions/${question.id}`);

    const [first, second] = await historyEntries();
    expect(first).toHaveTextContent("author@iqb.test added this Question");
    expect(second).toHaveTextContent("reviewer@iqb.test edited this Question");
    expect(within(second!).getByRole("time")).toHaveAttribute("datetime", edited.at);

    const text = within(second!).getByRole("group", { name: "Text" });
    expect(within(text).getByRole("deletion")).toHaveTextContent("What does satisfies do?");
    expect(within(text).getByRole("insertion")).toHaveTextContent("What does `satisfies` check?");

    const tags = within(second!).getByRole("group", { name: "Tags" });
    expect(within(tags).getByRole("deletion")).toHaveTextContent("typescript");
    expect(within(tags).getByRole("insertion")).toHaveTextContent("typescript, mid");

    // Left alone by the edit, so the event does not name it and neither does the page.
    expect(within(second!).queryByRole("group", { name: "Answer Notes" })).not.toBeInTheDocument();
  });

  it("says the Author submitted it anyway, and what it was judged too close to", async () => {
    const overridden: ChangeEvent = {
      id: "e0000000-0000-4000-8000-000000000003",
      questionId: question.id,
      viewerId: added.viewerId,
      viewerEmail: "author@iqb.test",
      at: added.at,
      type: "near_duplicate_overridden",
      payload: {
        nearDuplicates: [
          {
            questionId: "a0000000-0000-4000-8000-000000000002",
            text: "What does satisfies do in TypeScript?",
            similarity: 0.62,
          },
        ],
      },
    };
    aBankWhoseHistoryIs(() => answersWith({ events: [overridden, added] }));

    renderTheWholeClient(`/questions/${question.id}`);

    const [first] = await historyEntries();
    expect(first).toHaveTextContent(
      "author@iqb.test confirmed this Question is different from a Near-Duplicate",
    );
    expect(first).toHaveTextContent("What does satisfies do in TypeScript?");
  });

  it("reports a history that could not be read, and still shows the Question", async () => {
    const answers = [
      refusesWith(500, "internal_error", "Something went wrong on our side."),
      answersWith({ events: [added] }),
    ];
    aBankWhoseHistoryIs(() => answers.shift()!);

    renderTheWholeClient(`/questions/${question.id}`);

    expect(await screen.findByText("Something went wrong on our side.")).toBeVisible();
    expect(screen.getByRole("heading", { name: question.text })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    const [entry] = await historyEntries();
    expect(entry).toHaveTextContent("author@iqb.test added this Question");
  });

  it("says so when nothing has been recorded about the Question", async () => {
    // Questions the seed wrote straight into the bank have no events at all.
    aBankWhoseHistoryIs(() => answersWith({ events: [] }));

    renderTheWholeClient(`/questions/${question.id}`);

    expect(await screen.findByText("No changes have been recorded.")).toBeVisible();
  });
});
