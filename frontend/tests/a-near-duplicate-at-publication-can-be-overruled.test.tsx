import type { NearDuplicatesFound, Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, refusesWith, type FakeApi } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aReviewer = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000006",
  email: "reviewer@iqb.test",
  role: "reviewer",
});

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(aReviewer);
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

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000042",
  text: "How would you find a slow query?",
  publicationState: "pending",
});

/**
 * Refuses a publication as the API does when detection finds a Near-Duplicate, unless it
 * carries the Reviewer's word that the Question is different, in which case it is Published.
 */
function aBankThatFindsAMatch(): FakeApi {
  const pending: Question[] = [waiting];
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/questions/pending") return aPageOf(pending, asked);
      if (request.method === "POST" && asked.pathname === `/api/questions/${waiting.id}/publish`) {
        const sent = (await request.clone().json()) as { confirmedNotANearDuplicate: boolean };
        if (!sent.confirmedNotANearDuplicate) {
          return refusesWith(
            409,
            "conflict",
            "This Question closely resembles one already in the bank or waiting to be reviewed.",
            found,
          );
        }
        pending.splice(0, 1);
        return answersWith({ question: { ...waiting, publicationState: "published" } });
      }
      return undefined;
    },
  );
}

function publicationsSent(api: FakeApi): Request[] {
  return api.sent.filter((request) => request.url.endsWith("/publish"));
}

async function publishFromTheQueue(): Promise<void> {
  renderTheWholeClient("/review");
  const queue = await screen.findByRole("list", { name: "Pending Questions" });
  await userEvent.click(within(queue).getByRole("button", { name: "Publish" }));
}

describe("a Near-Duplicate found at publication", () => {
  it("is shown with the matches, each a link to the Question it names", async () => {
    aBankThatFindsAMatch();

    await publishFromTheQueue();

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByText(
        "This Question closely resembles one already in the bank or waiting to be reviewed.",
      ),
    ).toBeVisible();
    const match = dialog.getByRole("link", { name: found.nearDuplicates[0]!.text });
    expect(match).toHaveAttribute("href", `/questions/${found.nearDuplicates[0]!.questionId}`);
    expect(dialog.getByText("62% alike")).toBeVisible();
    expect(screen.queryByText(`"${waiting.text}" was not Published.`)).not.toBeInTheDocument();
  });

  it("leaves the Question Pending, and sends nothing more, when the Reviewer says so", async () => {
    const api = aBankThatFindsAMatch();
    await publishFromTheQueue();

    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Leave it Pending" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(waiting.text)).toBeVisible();
    expect(publicationsSent(api)).toHaveLength(1);
  });

  it("publishes it with the Reviewer's word that it is different", async () => {
    const api = aBankThatFindsAMatch();
    await publishFromTheQueue();

    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "It is different, publish it" }));

    expect(await screen.findByText("No Question is waiting for review.")).toBeVisible();
    const [first, again] = publicationsSent(api);
    expect(await first!.json()).toEqual({ confirmedNotANearDuplicate: false });
    expect(await again!.json()).toEqual({ confirmedNotANearDuplicate: true });
  });
});
