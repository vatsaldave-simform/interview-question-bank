import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aReader = {
  id: "7c3b4a1e-0000-4000-8000-000000000002",
  email: "reader@iqb.test",
  role: "reader" as const,
  isAdministrator: false,
};

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

// Written by somebody else, so neither a Reader nor another Author may change it.
const someoneElses = aQuestion({
  id: "a0000000-0000-4000-8000-000000000007",
  authorId: "7c3b4a1e-0000-4000-8000-000000000009",
  text: "What does satisfies do?",
});

/** Serves the Question and its history, and answers any edit with `refusal`. */
function aBankThatRefusesEdits(refusal: () => Response): void {
  fakeBank(
    (asked) => aPageOf([someoneElses], asked),
    (request, asked) => {
      if (asked.pathname === `/api/questions/${someoneElses.id}/history`) {
        return answersWith({ events: [] });
      }
      if (asked.pathname !== `/api/questions/${someoneElses.id}`) return undefined;
      return request.method === "PATCH" ? refusal() : answersWith({ question: someoneElses });
    },
  );
}

async function changeTheTextAndSave(): Promise<void> {
  const questionBox = await screen.findByLabelText("Question");
  await userEvent.type(questionBox, " In TypeScript.");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

/**
 * Whether a Viewer may edit is the API's answer. The client offers Edit to everyone and
 * reports the refusal, because hiding it would be the client answering too (ADR-0002).
 */
describe("an edit the API refused", () => {
  it("offers a Reader the Edit link, and shows the API's refusal when they save", async () => {
    signInAs(aReader);
    aBankThatRefusesEdits(() => refusesWith(403, "forbidden", "You may not do that."));
    renderTheWholeClient(`/questions/${someoneElses.id}`);

    await userEvent.click(await screen.findByRole("link", { name: "Edit" }));
    await changeTheTextAndSave();

    expect(await screen.findByText("The Question was not saved")).toBeVisible();
    expect(screen.getByText("You may not do that.")).toBeVisible();
    // Still on the form, with what they typed, rather than sent back as if it had worked.
    expect(window.location.pathname).toBe(`/questions/${someoneElses.id}/edit`);
    expect(screen.getByLabelText("Question")).toHaveValue("What does satisfies do? In TypeScript.");
  });

  it("shows the same refusal to an Author editing a Question they did not write", async () => {
    signInAs();
    aBankThatRefusesEdits(() => refusesWith(403, "forbidden", "You may not do that."));
    renderTheWholeClient(`/questions/${someoneElses.id}/edit`);

    await changeTheTextAndSave();

    expect(await screen.findByText("You may not do that.")).toBeVisible();
  });

  it("says there is no such Question when the edit form's Question is not found", async () => {
    signInAs();
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname.startsWith("/api/questions/")
          ? refusesWith(404, "not_found", "Not found.")
          : undefined,
    );
    renderTheWholeClient(`/questions/${someoneElses.id}/edit`);

    expect(await screen.findByText("Question not found")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
