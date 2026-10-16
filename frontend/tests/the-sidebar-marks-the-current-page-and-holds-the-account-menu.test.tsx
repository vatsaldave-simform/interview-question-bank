import type { Viewer } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith, aViewer } from "./helpers/fake-api";
import { aBankHolding, aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
  aBankHolding([]);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

async function theSidebar() {
  return within(await screen.findByRole("navigation", { name: "Main menu" }));
}

/** Each group the sidebar shows, by its name, with the links in it in order. */
async function linksByGroup(): Promise<Record<string, string[]>> {
  const sidebar = await theSidebar();
  await sidebar.findByRole("link", { name: "Browse" });
  const shown: Record<string, string[]> = {};
  for (const name of ["Questions", "Review", "Administration"]) {
    const group = sidebar.queryByRole("group", { name });
    if (group) shown[name] = within(group).getAllByRole("link").map((link) => link.textContent);
  }
  expect(sidebar.getAllByRole("group")).toHaveLength(Object.keys(shown).length);
  return shown;
}

const everyQuestionPage = ["Home", "Browse", "Add a Question", "Your Questions"];
const everyAdministrationPage = ["Role Requests", "Viewers", "Clients"];

describe("the sidebar", () => {
  it("replaces the top bar", async () => {
    renderTheWholeClient("/questions");

    await theSidebar();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Interview Question Bank" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it.each<[string, Viewer, Record<string, string[]>]>([
    ["a Reader", aViewer({ role: "reader" }), { Questions: ["Home", "Browse"] }],
    ["an Author", aViewer({ role: "author" }), { Questions: everyQuestionPage }],
    [
      "a Reviewer",
      aViewer({ role: "reviewer" }),
      { Questions: everyQuestionPage, Review: ["Review queue"] },
    ],
    [
      "an Administrator",
      anAdministrator,
      {
        Questions: everyQuestionPage,
        Review: ["Review queue"],
        Administration: everyAdministrationPage,
      },
    ],
    [
      "an Administrator who is also a Reader",
      aViewer({ role: "reader", isAdministrator: true }),
      { Questions: ["Home", "Browse"], Administration: everyAdministrationPage },
    ],
  ])("shows %s exactly the links their role allows", async (_who, viewer, expected) => {
    signInAs(viewer);
    renderTheWholeClient("/questions");

    expect(await linksByGroup()).toEqual(expected);
  });

  it("marks the page the Viewer is on, and no other", async () => {
    renderTheWholeClient("/questions/own");

    const sidebar = await theSidebar();
    expect(await sidebar.findByRole("link", { name: "Your Questions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(sidebar.getByRole("link", { name: "Browse" })).not.toHaveAttribute("aria-current");
  });

  it("leaves Browse unmarked on the other pages under its address", async () => {
    renderTheWholeClient("/questions/new");

    const sidebar = await theSidebar();
    await screen.findByRole("heading", { level: 1, name: "Add a Question" });
    expect(sidebar.getByRole("link", { name: "Browse" })).not.toHaveAttribute("aria-current");
    expect(sidebar.getByRole("link", { name: "Add a Question" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it.each(["/questions", "/questions?technology=react", "/questions?offset=20"])(
    "marks Browse on the bank at %s",
    async (address) => {
      renderTheWholeClient(address);

      const sidebar = await theSidebar();
      expect(await sidebar.findByRole("link", { name: "Browse" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(sidebar.getByRole("link", { name: "Your Questions" })).not.toHaveAttribute(
        "aria-current",
      );
    },
  );

  it("marks Home on Home", async () => {
    renderTheWholeClient("/");

    const sidebar = await theSidebar();
    expect(await sidebar.findByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(sidebar.getByRole("link", { name: "Browse" })).not.toHaveAttribute("aria-current");
  });

  it.each(["/questions", "/questions/own", "/account"])(
    "leaves Home unmarked at %s",
    async (address) => {
      renderTheWholeClient(address);

      const sidebar = await theSidebar();
      expect(await sidebar.findByRole("link", { name: "Home" })).not.toHaveAttribute(
        "aria-current",
      );
    },
  );

  it("keeps Clients marked on one Client's page", async () => {
    const northwind = aClient();
    signInAs(anAdministrator);
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname === "/api/clients/all") return answersWith({ clients: [northwind] });
        if (asked.pathname.endsWith("/grants")) return answersWith({ grants: [] });
        return undefined;
      },
    );
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    await screen.findByRole("heading", { level: 1, name: northwind.name });
    const sidebar = await theSidebar();
    expect(sidebar.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "page");
    expect(sidebar.getByRole("link", { name: "Viewers" })).not.toHaveAttribute("aria-current");
  });

  it("opens a menu from the Viewer's email holding their account and Log out", async () => {
    renderTheWholeClient("/questions");

    await theSidebar();
    await userEvent.click(screen.getByRole("button", { name: "author@iqb.test" }));

    const menu = within(await screen.findByRole("menu"));
    expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();
    await userEvent.click(menu.getByRole("menuitem", { name: "Your account" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  });

  it("leaves the role to the account page", async () => {
    // An address that does not name the role, so the role can only come from the label.
    signInAs(aViewer({ email: "sam@iqb.test", role: "author" }));
    renderTheWholeClient("/account");

    await screen.findByRole("heading", { level: 1, name: "Your account" });
    expect(screen.getByRole("button", { name: "sam@iqb.test" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Main menu" })).not.toHaveTextContent(/author/i);
    expect(screen.getByRole("main")).toHaveTextContent("Author");
  });

  it("never saves its state in a cookie, which would reach the server", async () => {
    renderTheWholeClient("/questions");

    await theSidebar();
    await userEvent.keyboard("{Control>}b{/Control}");
    await userEvent.keyboard("{Meta>}b{/Meta}");

    expect(document.cookie).not.toContain("sidebar");
  });
});

describe("the sidebar on a phone", () => {
  beforeEach(() => {
    vi.stubGlobal("innerWidth", 375);
  });

  async function theMenuButton() {
    return screen.findByRole("button", { name: "Open the menu" });
  }

  it("is a drawer behind a menu button, which closes when a page is picked", async () => {
    renderTheWholeClient("/questions");

    await userEvent.click(await theMenuButton());
    const drawer = await screen.findByRole("dialog");
    await userEvent.click(within(drawer).getByRole("link", { name: "Your Questions" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Your Questions" })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens, is moved through and closes with the keyboard alone", async () => {
    renderTheWholeClient("/questions");

    const button = await theMenuButton();
    while (document.activeElement !== button) await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    const drawer = await screen.findByRole("dialog");
    const pages = within(drawer).getByRole("navigation", { name: "Main menu" });
    const reached: string[] = [];
    for (let press = 0; press < 6; press += 1) {
      await userEvent.tab();
      const focused = document.activeElement;
      if (focused && pages.contains(focused)) reached.push(focused.textContent);
    }
    expect(reached).toEqual(everyQuestionPage);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });
});
