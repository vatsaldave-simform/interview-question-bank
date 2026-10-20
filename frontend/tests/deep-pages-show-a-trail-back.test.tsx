import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import {
  aClient,
  anAdministrator,
  answersWith,
  aQuestion,
  refusesWith,
} from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { homeGreeting } from "./helpers/home-page";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const question = aQuestion({ text: "What is a closure?", authorId: anAdministrator.id });
const client = aClient();

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
  fakeBank(
    (asked) => aPageOf([question], asked),
    (_request, asked) => {
      if (asked.pathname === `/api/questions/${question.id}`) return answersWith({ question });
      if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
      if (asked.pathname === "/api/clients/all") return answersWith({ clients: [client] });
      if (asked.pathname.endsWith("/grants")) return answersWith({ grants: [] });
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

describe("a page no sidebar link leads to", () => {
  it("shows a Question's page as Browse, then the Question", async () => {
    renderTheWholeClient(`/questions/${question.id}`);

    const [browse, here] = await theTrailUnder(question.text);
    expect(within(browse!).getByRole("link", { name: "Browse" })).toHaveAttribute(
      "href",
      "/questions",
    );
    const current = within(here!).getByText(question.text);
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).not.toHaveAttribute("href");
  });

  it("still shows the way back to Browse when the Question cannot be shown", async () => {
    const missing = aQuestion({ id: "a0000000-0000-4000-8000-000000000099" });
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname === `/api/questions/${missing.id}`
          ? refusesWith(404, "not_found", "Not found.")
          : undefined,
    );
    renderTheWholeClient(`/questions/${missing.id}`);

    await screen.findByText("Question not found");
    const trail = within(screen.getByRole("navigation", { name: "breadcrumb" }));
    expect(trail.getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/questions");
    expect(trail.getByText("Question")).toHaveAttribute("aria-current", "page");
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

  it("shows one Client's page as Administration, then Clients, then the Client", async () => {
    renderTheWholeClient(`/administration/clients/${client.id}`);

    const [administration, clients, here] = await theTrailUnder(client.name);
    expect(within(administration!).getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/administration",
    );
    expect(within(clients!).getByRole("link", { name: "Clients" })).toHaveAttribute(
      "href",
      "/administration/clients",
    );
    expect(within(here!).getByText(client.name)).toHaveAttribute("aria-current", "page");
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
    // Pointing at it shows the whole Question.
    expect(within(here!).getByTitle(long.text)).toBeVisible();
  });
});

describe("a page the sidebar leads to", () => {
  it.each([
    { address: "/", title: homeGreeting },
    { address: "/questions", title: "Browse" },
    { address: "/questions/own", title: "Your Questions" },
    { address: "/administration/role-requests", title: "Open Role Requests" },
    { address: "/administration/viewers", title: "Viewers" },
    { address: "/administration/clients", title: "Clients" },
  ])("shows no trail at $address", async ({ address, title }) => {
    renderTheWholeClient(address);

    await screen.findByRole("heading", { level: 1, name: title });
    expect(screen.queryByRole("navigation", { name: "breadcrumb" })).not.toBeInTheDocument();
  });
});
