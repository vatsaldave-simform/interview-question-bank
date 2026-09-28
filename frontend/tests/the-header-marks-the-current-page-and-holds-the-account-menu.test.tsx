import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
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

async function theHeader() {
  return within(await screen.findByRole("banner"));
}

describe("the header", () => {
  it("marks the page the Viewer is on, and no other", async () => {
    renderTheWholeClient("/questions/own");

    const header = await theHeader();
    expect(await header.findByRole("link", { name: "Your Questions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(header.getByRole("link", { name: "Questions" })).not.toHaveAttribute("aria-current");
  });

  it("marks Questions on the bank itself", async () => {
    renderTheWholeClient("/");

    const header = await theHeader();
    expect(await header.findByRole("link", { name: "Questions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(header.getByRole("link", { name: "Your Questions" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens a menu from the Viewer's email holding their account and Log out", async () => {
    renderTheWholeClient("/");

    const header = await theHeader();
    await userEvent.click(header.getByRole("button", { name: "author@iqb.test" }));

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
    expect(screen.getByRole("banner")).not.toHaveTextContent(/author/i);
    expect(screen.getByRole("main")).toHaveTextContent("Author");
  });
});
