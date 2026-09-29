import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { chooseTheme } from "@/platform/theme";
import { aDevice } from "./helpers/fake-device";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
  aBankHolding([]);
  aDevice({ dark: false });
});

afterEach(() => {
  // The choice is held in memory too, and one jsdom serves every test in this file.
  chooseTheme("device");
  stopRenewingSession();
  vi.unstubAllGlobals();
});

async function openTheAccountMenu() {
  const header = within(await screen.findByRole("banner"));
  await userEvent.click(header.getByRole("button", { name: "author@iqb.test" }));
  return within(await screen.findByRole("menu"));
}

describe("the account menu", () => {
  it("offers Light, Dark and Match my device, with Match my device on", async () => {
    renderTheWholeClient("/");

    const theme = within((await openTheAccountMenu()).getByRole("group", { name: "Theme" }));
    expect(theme.getByRole("menuitemradio", { name: "Light" })).not.toBeChecked();
    expect(theme.getByRole("menuitemradio", { name: "Dark" })).not.toBeChecked();
    expect(theme.getByRole("menuitemradio", { name: "Match my device" })).toBeChecked();
  });

  it("turns the page dark on Dark, and ticks Dark", async () => {
    renderTheWholeClient("/");

    await userEvent.click((await openTheAccountMenu()).getByRole("menuitemradio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect((await openTheAccountMenu()).getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
  });
});
