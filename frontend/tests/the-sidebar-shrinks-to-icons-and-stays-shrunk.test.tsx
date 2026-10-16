import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { chooseSidebarShrunk } from "@/platform/sidebar-choice";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
  aBankHolding([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  // The choice is held in memory when storage is blocked, and one jsdom serves every test here.
  chooseSidebarShrunk(false);
  window.localStorage.clear();
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** What a browser set to block site data does when a page touches storage. */
function storageIsBlocked() {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);
}

async function theSidebar() {
  return within(await screen.findByRole("navigation", { name: "Main menu" }));
}

async function shrinkIt() {
  await userEvent.click(await screen.findByRole("button", { name: "Shrink the sidebar" }));
}

async function isShrunk() {
  await theSidebar();
  return screen.queryByRole("button", { name: "Expand the sidebar" }) !== null;
}

describe("shrinking the sidebar", () => {
  it("starts wide, and shrinks and expands from its button", async () => {
    renderTheWholeClient("/questions");
    expect(await isShrunk()).toBe(false);

    await shrinkIt();
    expect(await isShrunk()).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Expand the sidebar" }));
    expect(await isShrunk()).toBe(false);
    expect(document.cookie).not.toContain("sidebar");
  });

  it("is still shrunk when the page is opened again", async () => {
    renderTheWholeClient("/questions");
    await shrinkIt();

    cleanup();
    renderTheWholeClient("/questions");

    expect(await isShrunk()).toBe(true);
  });

  it("still works when the browser blocks storage", async () => {
    storageIsBlocked();
    renderTheWholeClient("/questions");

    await shrinkIt();

    expect(await isShrunk()).toBe(true);
  });

  it("shows each icon's page name when it is focused", async () => {
    renderTheWholeClient("/questions");
    await shrinkIt();

    const sidebar = await theSidebar();
    sidebar.getByRole("link", { name: "Your Questions" }).focus();

    expect(await screen.findByRole("tooltip", { name: "Your Questions" })).toBeInTheDocument();
  });

  it("shows each icon's page name when it is pointed at", async () => {
    renderTheWholeClient("/questions");
    await shrinkIt();

    const sidebar = await theSidebar();
    await userEvent.hover(sidebar.getByRole("link", { name: "Browse" }));

    expect(await screen.findByRole("tooltip", { name: "Browse" })).toBeInTheDocument();
  });

  it("names no page in a tooltip while it is wide, because the names are already shown", async () => {
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    sidebar.getByRole("link", { name: "Browse" }).focus();

    await screen.findByRole("button", { name: "Shrink the sidebar" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shrinks and expands on Ctrl+B and Cmd+B, without a cookie", async () => {
    renderTheWholeClient("/questions");
    await theSidebar();

    await userEvent.keyboard("{Control>}b{/Control}");
    expect(await isShrunk()).toBe(true);
    await userEvent.keyboard("{Meta>}b{/Meta}");
    expect(await isShrunk()).toBe(false);

    expect(document.cookie).not.toContain("sidebar");
  });

  it("is not offered on a phone, where the sidebar is a drawer", async () => {
    vi.stubGlobal("innerWidth", 375);
    renderTheWholeClient("/questions");

    await screen.findByRole("button", { name: "Open the menu" });
    expect(screen.queryByRole("button", { name: "Shrink the sidebar" })).not.toBeInTheDocument();
  });
});
