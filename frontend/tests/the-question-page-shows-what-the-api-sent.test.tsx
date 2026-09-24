import { screen } from "@testing-library/react";
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

const question = aQuestion({
  id: "a0000000-0000-4000-8000-000000000007",
  text: "How would you find a slow query?",
  answerNotes: "Look for EXPLAIN ANALYZE before any guessing.",
  publicationState: "pending",
  tags: [
    { category: "technology", tag: "postgres" },
    { category: "seniority", tag: "mid" },
  ],
});

/** Answers this one Question on its own path, and the list with it in. */
function aBankHolding(): void {
  fakeBank(
    (asked) => aPageOf([question], asked),
    (_request, asked) =>
      asked.pathname === `/api/questions/${question.id}`
        ? answersWith({ question })
        : undefined,
  );
}

describe("the Question page", () => {
  it("shows the Question's text, Answer Notes, Tags and Publication State", async () => {
    aBankHolding();

    renderTheWholeClient(`/questions/${question.id}`);

    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
    expect(screen.getByText("Look for EXPLAIN ANALYZE before any guessing.")).toBeVisible();
    expect(screen.getByText("postgres")).toBeVisible();
    expect(screen.getByText("mid")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();
  });

  // The API answers a Question you cannot see exactly as one that does not exist, so the
  // page must not word the two differently either (ADR-0002).
  it("says there is no Question here when the API answers not found", async () => {
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname.startsWith("/api/questions/")
          ? refusesWith(404, "not_found", "Not found.")
          : undefined,
    );

    renderTheWholeClient(`/questions/${question.id}`);

    expect(await screen.findByText("Question not found")).toBeVisible();
    expect(screen.getByText("There is no Question at this address that you can see.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows any other failure in the API's own words, and asks again on Try again", async () => {
    const answers = [
      refusesWith(500, "internal_error", "Something went wrong on our side."),
      answersWith({ question }),
    ];
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname === `/api/questions/${question.id}` ? answers.shift() : undefined,
    );

    renderTheWholeClient(`/questions/${question.id}`);

    expect(await screen.findByText("Something went wrong on our side.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
  });

  it("opens from the Question's title on the browse list", async () => {
    aBankHolding();
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("link", { name: question.text }));

    expect(
      await screen.findByRole("heading", { name: "How would you find a slow query?" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${question.id}`);
  });
});
