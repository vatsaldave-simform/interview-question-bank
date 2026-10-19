import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator, aQuestion } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const question = aQuestion({ authorId: anAdministrator.id });

beforeEach(() => {
  replaceSession({ status: "unknown" });
  // A Reviewer and an Administrator, so every page is open to them.
  signInAs(anAdministrator);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("every signed-in page", () => {
  it.each([
    {
      address: "/questions",
      title: "Questions",
      says: "Every Published Question you can see. Search, or narrow it by Category.",
    },
    {
      address: `/questions/${question.id}`,
      title: question.text,
      says: "One Question, with its Answer Notes and where it came from.",
    },
    {
      address: `/questions/${question.id}/edit`,
      title: "Edit the Question",
      says: "Change what the Question says. Its history keeps who changed it and when.",
    },
    {
      address: "/account",
      title: "Your account",
      says: "Your email, your role, and any Role Request you have made.",
    },
    {
      address: "/administration/clients",
      title: "Clients",
      says: "Open a Client to see and change who holds a Permission Grant for it.",
    },
  ])("says what $address is for, under its title", async ({ address, title, says }) => {
    aBankHolding([question]);
    renderTheWholeClient(address);

    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(main.getByText(says)).toBeVisible();
  });
});
