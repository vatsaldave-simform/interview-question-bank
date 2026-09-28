import type { Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { questionPageSize } from "@/features/questions/question-pages.schema";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, refusesWith } from "./helpers/fake-api";
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

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000011",
  text: "When would you choose a queue over a direct call?",
  publicationState: "pending",
});
const alsoWaiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000012",
  text: "How do you tell a slow query from a slow network?",
  publicationState: "pending",
});

/** A bank holding the `pending` Questions, which takes each Published or Rejected one out of
 * the queue, unless `refuse` answers first. */
function aBankReviewing(
  pending: Question[],
  refuse: (request: Request) => Response | undefined = () => undefined,
) {
  const held = [...pending];
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/questions/pending") return aPageOf(pending, asked);
      const one = held.find(({ id }) => asked.pathname === `/api/questions/${id}`);
      if (one !== undefined && request.method === "GET") return answersWith({ question: one });
      const path = /^\/api\/questions\/([^/]+)\/(publish|reject)$/.exec(asked.pathname);
      if (path === null || request.method !== "POST") return undefined;
      const refused = refuse(request);
      if (refused !== undefined) return refused;
      const moved = pending.find(({ id }) => id === path[1]);
      if (moved === undefined) throw new Error(`The queue does not hold ${path[1]}.`);
      pending.splice(pending.indexOf(moved), 1);
      const sent = (await request.json()) as { reason?: string };
      return answersWith({
        question: {
          ...moved,
          publicationState: path[2] === "publish" ? "published" : "rejected",
          reason: sent.reason ?? null,
        },
      });
    },
  );
}

function actsSent(api: ReturnType<typeof fakeBank>): Request[] {
  return api.sent.filter(
    (request) => request.method === "POST" && /\/(publish|reject)$/.test(request.url),
  );
}

async function cardFor(text: string) {
  const queue = await screen.findByRole("list", { name: "Pending Questions" });
  const card = within(queue)
    .getAllByRole("article")
    .find((candidate) => within(candidate).queryByText(text) !== null);
  if (card === undefined) throw new Error(`No card for ${text}.`);
  return within(card);
}

describe("publishing from the review queue", () => {
  it("publishes a Question, which leaves the queue", async () => {
    const api = aBankReviewing([waiting, alsoWaiting]);
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Publish" }));

    const queue = within(screen.getByRole("list", { name: "Pending Questions" }));
    await vi.waitFor(() => expect(queue.queryByText(waiting.text)).not.toBeInTheDocument());
    expect(queue.getByText(alsoWaiting.text)).toBeVisible();
    const [sent] = actsSent(api);
    expect(new URL(sent!.url).pathname).toBe(`/api/questions/${waiting.id}/publish`);
    expect(await sent!.json()).toEqual({ confirmedNotANearDuplicate: false });
  });

  it("reports a refusal in the API's words, and keeps it after the queue reloads", async () => {
    const pending = [waiting, alsoWaiting];
    aBankReviewing(pending, (request) => {
      if (!request.url.includes(waiting.id)) return undefined;
      // Published a moment ago by another Reviewer.
      pending.splice(pending.indexOf(waiting), 1);
      return refusesWith(409, "conflict", "Only a Pending Question can be Published.");
    });
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Publish" }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText(`"${waiting.text}" was not Published.`)).toBeVisible();
    expect(alert.getByText("Only a Pending Question can be Published.")).toBeVisible();
    const queue = within(screen.getByRole("list", { name: "Pending Questions" }));
    await vi.waitFor(() => expect(queue.queryByText(waiting.text)).not.toBeInTheDocument());
    expect(alert.getByText("Only a Pending Question can be Published.")).toBeVisible();
  });

  it("reports a permission refusal as the API words it", async () => {
    aBankReviewing([waiting], () => refusesWith(403, "forbidden", "Only a Reviewer may do that."));
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Publish" }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("Only a Reviewer may do that.")).toBeVisible();
    expect(card.getByText(waiting.text)).toBeVisible();
  });
});

/** The reason form, which opens in a dialog rather than inside the card. */
function rejectDialog() {
  return within(screen.getByRole("dialog", { name: "Reject the Question" }));
}

describe("a refusal shown above the queue", () => {
  const refusedWith = () => refusesWith(403, "forbidden", "Only a Reviewer may do that.");

  it("stays when another Question's reason box is cancelled", async () => {
    aBankReviewing([waiting, alsoWaiting], refusedWith);
    renderTheWholeClient("/review");

    await userEvent.click((await cardFor(waiting.text)).getByRole("button", { name: "Publish" }));
    await screen.findByText(`"${waiting.text}" was not Published.`);
    const other = await cardFor(alsoWaiting.text);
    await userEvent.click(other.getByRole("button", { name: "Reject" }));
    await userEvent.click(rejectDialog().getByRole("button", { name: "Cancel" }));

    expect(screen.getByText(`"${waiting.text}" was not Published.`)).toBeVisible();
  });

  it("goes when the Reviewer moves to another page", async () => {
    const aFullPage = Array.from({ length: questionPageSize }, (_, index) =>
      aQuestion({
        id: `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        text: `Pending number ${index + 1}`,
        publicationState: "pending",
      }),
    );
    aBankReviewing(aFullPage, refusedWith);
    renderTheWholeClient("/review");

    const first = await cardFor("Pending number 1");
    await userEvent.click(first.getByRole("button", { name: "Publish" }));
    await screen.findByText(`"Pending number 1" was not Published.`);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    await vi.waitFor(() => expect(window.location.search).toBe(`?offset=${questionPageSize}`));
    expect(screen.queryByText(`"Pending number 1" was not Published.`)).not.toBeInTheDocument();
  });
});

describe("editing from the review queue", () => {
  it("opens the edit screen for that Question", async () => {
    aBankReviewing([waiting]);
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("link", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Edit the Question" })).toBeVisible();
    expect(window.location.pathname).toBe(`/questions/${waiting.id}/edit`);
  });
});

describe("rejecting from the review queue", () => {
  it("refuses a rejection with no reason on its field, and sends nothing", async () => {
    const api = aBankReviewing([waiting]);
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Reject" }));
    await userEvent.type(rejectDialog().getByLabelText("Why it is Rejected"), "   ");
    await userEvent.click(rejectDialog().getByRole("button", { name: "Send the rejection" }));

    const reason = rejectDialog().getByLabelText("Why it is Rejected");
    expect(reason).toHaveAccessibleDescription(
      "Say why, so the Author can put it right, in 2,000 characters or fewer.",
    );
    expect(reason).toHaveFocus();
    expect(actsSent(api)).toHaveLength(0);
  });

  it("rejects a Question with the reason written, which leaves the queue", async () => {
    const api = aBankReviewing([waiting, alsoWaiting]);
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Reject" }));
    await userEvent.type(
      rejectDialog().getByLabelText("Why it is Rejected"),
      "  Too close to one we have. ",
    );
    await userEvent.click(rejectDialog().getByRole("button", { name: "Send the rejection" }));

    const queue = within(screen.getByRole("list", { name: "Pending Questions" }));
    await vi.waitFor(() => expect(queue.queryByText(waiting.text)).not.toBeInTheDocument());
    const [sent] = actsSent(api);
    expect(new URL(sent!.url).pathname).toBe(`/api/questions/${waiting.id}/reject`);
    expect(await sent!.json()).toEqual({ reason: "Too close to one we have." });
  });

  it("puts a reason the API refused on its field", async () => {
    aBankReviewing([waiting], () =>
      refusesWith(400, "invalid_request", "The request is not valid.", {
        errors: [],
        properties: { reason: { errors: ["Too big: expected string to have <=2000 characters"] } },
      }),
    );
    renderTheWholeClient("/review");

    const card = await cardFor(waiting.text);
    await userEvent.click(card.getByRole("button", { name: "Reject" }));
    await userEvent.type(rejectDialog().getByLabelText("Why it is Rejected"), "Not for us.");
    await userEvent.click(rejectDialog().getByRole("button", { name: "Send the rejection" }));

    const problem = "Say why, so the Author can put it right, in 2,000 characters or fewer.";
    expect(await rejectDialog().findByText(problem)).toBeVisible();
    expect(screen.queryByText(`"${waiting.text}" was not Rejected.`)).not.toBeInTheDocument();
  });
});
