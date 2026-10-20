import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith, aQuestion } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { homeGreeting } from "./helpers/home-page";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const question = aQuestion({ authorId: anAdministrator.id });
const client = aClient();

beforeEach(() => {
  replaceSession({ status: "unknown" });
  // A Reviewer and an Administrator, so every page is open to them.
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

describe("every signed-in page", () => {
  it.each([
    {
      address: "/",
      title: homeGreeting,
      says: "Signed in as reviewer@iqb.test, a Reviewer and an Administrator.",
    },
    {
      address: "/questions",
      title: "Questions",
      says: "Every Published Question you can see, to search or narrow by Category.",
    },
    {
      address: "/questions/new",
      title: "Add a Question",
      says: "A Reviewer reads it before it is in the bank.",
    },
    {
      address: "/questions/own",
      title: "Your Questions",
      says: "The Questions you added that are not in the bank yet: Pending, or Rejected with the reason.",
    },
    {
      address: `/questions/${question.id}`,
      title: question.text,
      says: "One Question, with its Answer Notes and where it came from.",
    },
    {
      address: `/questions/${question.id}/edit`,
      title: "Edit the Question",
      says: "Change what the Question says, and its history keeps who changed it and when.",
    },
    {
      address: "/review",
      title: "Review queue",
      says: "Pending Questions waiting on a Reviewer, the one that has waited longest first.",
    },
    {
      address: "/account",
      title: "Your account",
      says: "Your email, your role, and any Role Request you have made.",
    },
    {
      address: "/administration/role-requests",
      title: "Open Role Requests",
      says: "Viewers asking for a different role, the one waiting longest first.",
    },
    {
      address: "/administration/viewers",
      title: "Viewers",
      says: "Everyone who can log in, or could before they were Deactivated.",
    },
    {
      address: "/administration/clients",
      title: "Clients",
      says: "Open a Client to see and change who holds a Permission Grant for it.",
    },
    {
      address: `/administration/clients/${client.id}`,
      title: client.name,
      says: "The Viewers who may see the Questions restricted to this Client.",
    },
  ])("says what $address is for, under its title", async ({ address, title, says }) => {
    renderTheWholeClient(address);

    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(main.getByText(says)).toBeVisible();
  });
});
