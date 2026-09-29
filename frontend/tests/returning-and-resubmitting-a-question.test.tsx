import type { NearDuplicatesFound, PublicationState, Question } from "@iqb/shared";
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
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const published = aQuestion({
  id: "a0000000-0000-4000-8000-000000000031",
  text: "When would you reach for a database transaction?",
  publicationState: "published",
});

const rejected = aQuestion({
  id: "a0000000-0000-4000-8000-000000000032",
  text: "What is 2 + 2?",
  publicationState: "rejected",
  reason: "Too easy to tell anyone anything about the candidate.",
});

const pending = aQuestion({
  id: "a0000000-0000-4000-8000-000000000033",
  text: "How would you find a slow query?",
  publicationState: "pending",
});

const movedTo: Record<string, PublicationState> = {
  publish: "published",
  reject: "rejected",
  return: "rejected",
  resubmit: "pending",
};

/** A bank holding `questions`, which moves each one as the four acts do, unless `refuse`
 * answers first. Its own list is every Question that is not Published. */
function aBankHolding(
  questions: Question[],
  refuse: (request: Request) => Response | Promise<Response | undefined> | undefined = () =>
    undefined,
): FakeApi {
  const held = new Map(questions.map((question) => [question.id, question]));
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/questions/own") {
        const own = [...held.values()].filter((one) => one.publicationState !== "published");
        return aPageOf(own, asked);
      }
      const path = /^\/api\/questions\/([^/]+)(?:\/(\w+))?$/.exec(asked.pathname);
      const question = held.get(path?.[1] ?? "");
      if (question === undefined) return undefined;
      if (path![2] === "history") return answersWith({ events: [] });
      if (path![2] === undefined) return answersWith({ question });
      const refused = await refuse(request);
      if (refused !== undefined) return refused;
      const sent = request.headers.has("content-type")
        ? ((await request.json()) as { reason?: string })
        : {};
      const moved = {
        ...question,
        publicationState: movedTo[path![2]!]!,
        reason: sent.reason ?? null,
      };
      held.set(question.id, moved);
      return answersWith({ question: moved });
    },
  );
}

function actsSent(api: FakeApi, act: string): Request[] {
  return api.sent.filter((request) => request.method === "POST" && request.url.endsWith(act));
}

describe("returning a Published Question to its Author", () => {
  it("sends the reason, and the page shows the Question as Rejected with it", async () => {
    signInAs(aReviewer);
    const api = aBankHolding([published]);
    renderTheWholeClient(`/questions/${published.id}`);

    await userEvent.click(await screen.findByRole("button", { name: "Return to its Author" }));
    const dialog = within(screen.getByRole("dialog", { name: "Return it to its Author" }));
    await userEvent.type(
      dialog.getByLabelText("Why it is returned"),
      "Restricted to the wrong Client.",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Return it" }));

    expect(await screen.findByText("Restricted to the wrong Client.")).toBeVisible();
    expect(screen.getByText("Rejected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resubmit" })).toBeVisible();
    const [sent] = actsSent(api, "/return");
    expect(new URL(sent!.url).pathname).toBe(`/api/questions/${published.id}/return`);
    expect(await sent!.json()).toEqual({ reason: "Restricted to the wrong Client." });
  });

  it("reports the API's refusal to a Reader who presses it", async () => {
    signInAs(aViewer({ role: "reader" }));
    aBankHolding([published], () => refusesWith(403, "forbidden", "Only a Reviewer may do that."));
    renderTheWholeClient(`/questions/${published.id}`);

    await userEvent.click(await screen.findByRole("button", { name: "Return to its Author" }));
    await userEvent.type(screen.getByLabelText("Why it is returned"), "It reads badly.");
    await userEvent.click(screen.getByRole("button", { name: "Return it" }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText("This Question was not returned.")).toBeVisible();
    expect(alert.getByText("Only a Reviewer may do that.")).toBeVisible();
    // Closed, so the refusal is not hidden behind it.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("resubmitting a Rejected Question", () => {
  it("sends it from the Author's own list, which then shows it as Pending", async () => {
    signInAs();
    const api = aBankHolding([rejected]);
    renderTheWholeClient("/questions/own");

    const list = await screen.findByRole("list", { name: "Your Questions" });
    await userEvent.click(within(list).getByRole("button", { name: "Resubmit" }));

    expect(await within(list).findByText("Pending")).toBeVisible();
    expect(within(list).queryByRole("button", { name: "Resubmit" })).not.toBeInTheDocument();
    const [sent] = actsSent(api, "/resubmit");
    expect(new URL(sent!.url).pathname).toBe(`/api/questions/${rejected.id}/resubmit`);
    expect(await sent!.text()).toBe("");
  });

  it("offers the edit screen beside it", async () => {
    signInAs();
    aBankHolding([rejected]);
    renderTheWholeClient("/questions/own");

    const list = await screen.findByRole("list", { name: "Your Questions" });
    await userEvent.click(within(list).getByRole("link", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Edit the Question" })).toBeVisible();
  });

  it("reports a refusal above the list in the API's words", async () => {
    signInAs();
    aBankHolding([rejected], () =>
      refusesWith(409, "conflict", "Only a Rejected Question can be resubmitted."),
    );
    renderTheWholeClient("/questions/own");

    const list = await screen.findByRole("list", { name: "Your Questions" });
    await userEvent.click(within(list).getByRole("button", { name: "Resubmit" }));

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText(`"${rejected.text}" was not resubmitted.`)).toBeVisible();
    expect(alert.getByText("Only a Rejected Question can be resubmitted.")).toBeVisible();
  });
});

describe("the acts on the Question page", () => {
  it("offers Publish and Reject for a Pending Question", async () => {
    signInAs(aReviewer);
    aBankHolding([pending]);
    renderTheWholeClient(`/questions/${pending.id}`);

    expect(await screen.findByRole("button", { name: "Publish" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resubmit" })).not.toBeInTheDocument();
  });

  it("shows a Near-Duplicate found at publication, as the queue does", async () => {
    signInAs(aReviewer);
    const found: NearDuplicatesFound = {
      nearDuplicates: [{ questionId: published.id, text: published.text, similarity: 0.7 }],
    };
    const api = aBankHolding([pending], async (request) => {
      const sent = (await request.clone().json()) as { confirmedNotANearDuplicate?: boolean };
      return sent.confirmedNotANearDuplicate === false
        ? refusesWith(409, "conflict", "This Question closely resembles one.", found)
        : undefined;
    });
    renderTheWholeClient(`/questions/${pending.id}`);

    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("link", { name: published.text })).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "It is different, Publish it" }));

    expect(await screen.findByText("Published")).toBeVisible();
    expect(screen.getByRole("button", { name: "Return to its Author" })).toBeVisible();
    const [, again] = actsSent(api, "/publish");
    expect(await again!.json()).toEqual({ confirmedNotANearDuplicate: true });
  });
});
