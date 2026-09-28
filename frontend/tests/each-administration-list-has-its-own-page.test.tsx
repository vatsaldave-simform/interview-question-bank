import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const northwind = aClient();

function aBankWithOneClient() {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => {
      if (asked.pathname === "/api/clients/all") return answersWith({ clients: [northwind] });
      if (asked.pathname === `/api/clients/${northwind.id}/grants`) {
        return answersWith({ grants: [] });
      }
      return undefined;
    },
  );
}

async function theSideMenu() {
  return within(await screen.findByRole("navigation", { name: "Administration" }));
}

function grantsAsked(api: ReturnType<typeof fakeBank>): string[] {
  return api.sent
    .map((request) => new URL(request.url).pathname)
    .filter((path) => path.endsWith("/grants"));
}

describe("the administration pages", () => {
  it("open on the Role Requests, marked in the side menu", async () => {
    aBankWithOneClient();
    renderTheWholeClient("/administration");

    expect(await screen.findByText("No Role Request is waiting.")).toBeVisible();
    expect(window.location.pathname).toBe("/administration/role-requests");
    const menu = await theSideMenu();
    expect(menu.getByRole("link", { name: "Role Requests" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(menu.getByRole("link", { name: "Viewers" })).not.toHaveAttribute("aria-current");
  });

  it("move between the lists from the side menu, which marks the one open", async () => {
    aBankWithOneClient();
    renderTheWholeClient("/administration");

    const menu = await theSideMenu();
    await userEvent.click(menu.getByRole("link", { name: "Viewers" }));

    expect(await screen.findByRole("table", { name: "Viewers" })).toBeVisible();
    expect(window.location.pathname).toBe("/administration/viewers");
    expect(menu.getByRole("link", { name: "Viewers" })).toHaveAttribute("aria-current", "page");
    expect(menu.getByRole("link", { name: "Role Requests" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("list the Clients without asking for any Client's Grants", async () => {
    const api = aBankWithOneClient();
    renderTheWholeClient("/administration/clients");

    expect(await screen.findByRole("link", { name: northwind.name })).toBeVisible();
    expect(grantsAsked(api)).toEqual([]);
  });

  it("open a Client's own page with its Grants, with Clients still marked", async () => {
    const api = aBankWithOneClient();
    renderTheWholeClient("/administration/clients");

    await userEvent.click(await screen.findByRole("link", { name: northwind.name }));

    expect(
      await screen.findByRole("heading", { level: 1, name: northwind.name }),
    ).toBeVisible();
    expect(await screen.findByText("Nobody holds a Grant against this Client.")).toBeVisible();
    expect(window.location.pathname).toBe(`/administration/clients/${northwind.id}`);
    expect(grantsAsked(api)).toEqual([`/api/clients/${northwind.id}/grants`]);
    const menu = await theSideMenu();
    expect(menu.getByRole("link", { name: "Clients" })).toHaveAttribute("aria-current", "page");
  });
});
