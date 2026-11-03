import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

// Every list in the console is empty, unless a test says otherwise.
beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
  fakeBank((asked) => aPageOf([], asked));
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** The empty list alone, so the sidebar's links are not counted. */
async function theEmptyList(saying: string) {
  return within(await screen.findByRole("region", { name: saying }));
}

describe("an empty Role Requests", () => {
  it("says none is open, and offers no act", async () => {
    renderTheWholeClient("/administration/role-requests");

    const empty = await theEmptyList("No Role Request is open");
    expect(
      empty.getByText("When a Viewer asks for a different role, it shows here for you to decide."),
    ).toBeVisible();
    expect(empty.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("an empty Viewers", () => {
  it("says so, and offers Add a Viewer in place of the page's own button", async () => {
    renderTheWholeClient("/administration/viewers");

    const empty = await theEmptyList("Nobody can log in yet");
    expect(
      empty.getByText("Add a Viewer, and they are emailed a link to set their password."),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Add a Viewer" })).toHaveLength(1);
    await userEvent.click(empty.getByRole("button", { name: "Add a Viewer" }));
    expect(await screen.findByRole("dialog", { name: "Create a Viewer" })).toBeVisible();
  });
});

describe("an empty Clients", () => {
  it("says so, and offers Add a Client in place of the page's own button", async () => {
    renderTheWholeClient("/administration/clients");

    const empty = await theEmptyList("No Client yet");
    expect(
      empty.getByText("Add a Client, and Questions can then name it."),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Add a Client" })).toHaveLength(1);
    await userEvent.click(empty.getByRole("button", { name: "Add a Client" }));
    expect(await screen.findByRole("dialog", { name: "Create a Client" })).toBeVisible();
  });
});
