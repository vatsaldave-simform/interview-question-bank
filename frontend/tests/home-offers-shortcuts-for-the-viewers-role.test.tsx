import type { Viewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator, aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  aBankHolding([]);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

async function theShortcuts() {
  return within(await screen.findByRole("region", { name: "Shortcuts" }));
}

const authorPages = ["Browse the bank", "Add a Question", "Your Questions"];
const administrationPages = ["Role Requests", "Viewers", "Clients"];

describe("the shortcuts on Home", () => {
  it.each<[string, Viewer, string[]]>([
    ["a Reader", aViewer({ role: "reader" }), ["Browse the bank"]],
    ["an Author", aViewer({ role: "author" }), authorPages],
    ["a Reviewer", aViewer({ role: "reviewer" }), [...authorPages, "Review queue"]],
    ["an Administrator", anAdministrator, [...authorPages, "Review queue", ...administrationPages]],
    [
      "an Administrator who is also a Reader",
      aViewer({ role: "reader", isAdministrator: true }),
      ["Browse the bank", ...administrationPages],
    ],
  ])("offer %s exactly the pages their role allows", async (_who, viewer, expected) => {
    signInAs(viewer);
    renderTheWholeClient("/");

    const shortcuts = await theShortcuts();
    expect(shortcuts.getAllByRole("link").map((link) => link.textContent)).toEqual(expected);
  });

  it("open the page they name", async () => {
    signInAs(aViewer({ role: "author" }));
    renderTheWholeClient("/");

    await userEvent.click((await theShortcuts()).getByRole("link", { name: "Add a Question" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Add a Question" })).toBeVisible();
    expect(window.location.pathname).toBe("/questions/new");
  });
});
