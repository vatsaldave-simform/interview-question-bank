import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator, answersWith, aQuestion } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const question = aQuestion({ text: "What is a closure?", authorId: anAdministrator.id });

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
  fakeBank(
    (asked) => aPageOf([question], asked),
    (_request, asked) => {
      if (asked.pathname === `/api/questions/${question.id}`) return answersWith({ question });
      if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
      return undefined;
    },
  );
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** Each step of the trail, once the page has its title. */
async function theTrailUnder(title: string) {
  await screen.findByRole("heading", { level: 1, name: title });
  const trail = within(screen.getByRole("navigation", { name: "breadcrumb" }));
  return trail.getAllByRole("listitem");
}

describe("a deep page", () => {
  it("shows a Question's page as Browse, then the Question", async () => {
    renderTheWholeClient(`/questions/${question.id}`);

    const [browse, here] = await theTrailUnder(question.text);
    expect(within(browse!).getByRole("link", { name: "Browse" })).toHaveAttribute(
      "href",
      "/questions",
    );
    expect(here).toHaveTextContent(question.text);
    expect(within(here!).getByText(question.text)).toHaveAttribute("aria-current", "page");
  });

  it("shows editing a Question as Browse, then the Question, then Edit", async () => {
    renderTheWholeClient(`/questions/${question.id}/edit`);
    await screen.findByDisplayValue(question.text);

    const [browse, theQuestion, here] = await theTrailUnder("Edit the Question");
    expect(within(browse!).getByRole("link", { name: "Browse" })).toHaveAttribute(
      "href",
      "/questions",
    );
    expect(within(theQuestion!).getByRole("link", { name: question.text })).toHaveAttribute(
      "href",
      `/questions/${question.id}`,
    );
    expect(within(here!).getByText("Edit")).toHaveAttribute("aria-current", "page");
  });

  it("cuts a long Question short in the trail, and keeps it whole in the title", async () => {
    const long = aQuestion({
      text: "How would you find a memory leak in a Node.js service that only shows up after a few days?",
    });
    fakeBank(
      (asked) => aPageOf([long], asked),
      (_request, asked) => {
        if (asked.pathname === `/api/questions/${long.id}`) return answersWith({ question: long });
        if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
        return undefined;
      },
    );
    renderTheWholeClient(`/questions/${long.id}`);

    const [, here] = await theTrailUnder(long.text);
    expect(here).toHaveTextContent(/^How would you find a memory leak in a Node\.js…$/);
  });
});

describe("a page the sidebar leads to", () => {
  it.each([
    { address: "/", title: "Welcome back" },
    { address: "/questions", title: "Questions" },
    { address: "/questions/own", title: "Your Questions" },
  ])("shows no trail at $address", async ({ address, title }) => {
    renderTheWholeClient(address);

    await screen.findByRole("heading", { level: 1, name: title });
    expect(screen.queryByRole("navigation", { name: "breadcrumb" })).not.toBeInTheDocument();
  });
});
