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

const named = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "How would you migrate this client's reporting pipeline?",
  clients: [
    { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" },
    { id: "c0000000-0000-4000-8000-000000000002", name: "Globex" },
  ],
});

const unnamed = aQuestion({
  id: "a0000000-0000-4000-8000-000000000022",
  text: "What is a closure?",
});

function chipsIn(container: HTMLElement): (string | null)[] {
  const list = within(container).getByRole("list", { name: "Clients" });
  return within(list)
    .getAllByRole("listitem")
    .map((chip) => chip.textContent);
}

describe("the Clients a Question names", () => {
  it("shows one chip per Client on a card, in the order the API sent, and none without", async () => {
    aBankHolding([named, unnamed]);
    renderTheWholeClient("/questions");

    const [namedCard, unnamedCard] = await screen.findAllByRole("article");
    expect(chipsIn(namedCard!)).toEqual(["Acme", "Globex"]);
    expect(within(unnamedCard!).queryByRole("list", { name: "Clients" })).toBeNull();
  });

  it("shows one chip per Client on the Question page", async () => {
    aBankHolding([named]);
    renderTheWholeClient(`/questions/${named.id}`);

    const heading = await screen.findByRole("heading", { level: 1, name: named.text });
    expect(chipsIn(heading.closest("article")!)).toEqual(["Acme", "Globex"]);
  });

  it("no longer says a Client limits who can see the Question", async () => {
    aBankHolding([named]);
    renderTheWholeClient(`/questions/${named.id}`);

    const heading = await screen.findByRole("heading", { level: 1, name: named.text });
    expect(heading.closest("article")).not.toHaveTextContent(/Restricted to|with a Grant for/);
  });

  it("shows nothing about Clients on the page of a Question that names none", async () => {
    aBankHolding([unnamed]);
    renderTheWholeClient(`/questions/${unnamed.id}`);

    await screen.findByRole("heading", { level: 1, name: unnamed.text });
    expect(screen.queryByRole("list", { name: "Clients" })).toBeNull();
  });
});
