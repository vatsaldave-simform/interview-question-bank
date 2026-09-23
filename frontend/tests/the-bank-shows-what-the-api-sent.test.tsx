import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
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

describe("the browse screen", () => {
  it("shows each Question's text, Answer Notes and Tags", async () => {
    const question = aQuestion({
      text: "How would you find a slow query?",
      answerNotes: "Look for EXPLAIN ANALYZE before any guessing.",
      tags: [
        { category: "technology", tag: "postgres" },
        { category: "seniority", tag: "mid" },
      ],
    });
    fakeBank((asked) => aPageOf([question], asked));

    renderTheWholeClient("/");

    const card = (await screen.findByText("How would you find a slow query?")).closest("article")!;
    expect(within(card).getByText("Look for EXPLAIN ANALYZE before any guessing.")).toBeVisible();
    expect(within(card).getByText("postgres")).toBeVisible();
    expect(within(card).getByText("mid")).toBeVisible();
  });

  // The API is the only thing that decides what a Viewer may see. A client that hid a
  // restricted or Pending row would be a second answer to that question.
  it("shows every Question the API sent, restricted or Pending, without judging any", async () => {
    const questions = [
      aQuestion({ id: "a0000000-0000-4000-8000-000000000001", text: "In the open bank" }),
      aQuestion({
        id: "a0000000-0000-4000-8000-000000000002",
        text: "Restricted to a Client",
        clientId: "c0000000-0000-4000-8000-000000000001",
      }),
      aQuestion({
        id: "a0000000-0000-4000-8000-000000000003",
        text: "Awaiting a Reviewer",
        publicationState: "pending",
      }),
    ];
    fakeBank((asked) => aPageOf(questions, asked));

    renderTheWholeClient("/");

    expect(await screen.findByText("In the open bank")).toBeVisible();
    expect(screen.getByText("Restricted to a Client")).toBeVisible();
    expect(screen.getByText("Awaiting a Reviewer")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("says it is loading while the list has not answered", async () => {
    fakeBank(() => new Promise<Response>(() => {}));

    renderTheWholeClient("/");

    expect(await screen.findByText("Loading Questions…")).toBeVisible();
  });

  it("says so when nothing matches, rather than showing an empty page", async () => {
    fakeBank((asked) => aPageOf([], asked));

    renderTheWholeClient("/?technology=react");

    expect(await screen.findByText("No Questions match.")).toBeVisible();
  });
});
