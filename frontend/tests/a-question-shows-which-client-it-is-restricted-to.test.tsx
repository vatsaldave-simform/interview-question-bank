import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const restricted = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "How would you migrate this client's reporting pipeline?",
  client: { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" },
});

const unrestricted = aQuestion({
  id: "a0000000-0000-4000-8000-000000000022",
  text: "What is a closure?",
});

describe("which Client a Question is restricted to", () => {
  it("shows the Client on a restricted card and nothing on an unrestricted one", async () => {
    aBankHolding([restricted, unrestricted]);
    renderTheWholeClient("/");

    const [restrictedCard, unrestrictedCard] = await screen.findAllByRole("article");
    expect(within(restrictedCard!).getByText("Restricted to Acme")).toBeVisible();
    expect(unrestrictedCard).not.toHaveTextContent(/Restricted to/);
  });

  it("hides the lock from a screen reader, so the words carry the meaning", async () => {
    aBankHolding([restricted]);
    renderTheWholeClient("/");

    const badge = await screen.findByText("Restricted to Acme");
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("says on the Question page who can see it", async () => {
    aBankHolding([restricted]);
    renderTheWholeClient(`/questions/${restricted.id}`);

    await screen.findByRole("heading", { level: 1, name: restricted.text });
    expect(screen.getByText("Restricted to Acme")).toBeVisible();
    expect(
      screen.getByText("Only Viewers with a Grant for Acme can see this Question."),
    ).toBeVisible();
  });

  it("says nothing about a Client on an unrestricted Question's page", async () => {
    aBankHolding([unrestricted]);
    renderTheWholeClient(`/questions/${unrestricted.id}`);

    const heading = await screen.findByRole("heading", { level: 1, name: unrestricted.text });
    expect(heading.closest("article")).not.toHaveTextContent(/Restricted to|with a Grant for/);
  });

  it("shows the Client on the edit page", async () => {
    aBankHolding([restricted]);
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    expect(await screen.findByText("Restricted to Acme")).toBeVisible();
  });
});
