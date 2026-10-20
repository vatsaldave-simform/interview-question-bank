import type { RoleRequest, Viewer } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aRoleRequest, aViewer, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(aViewer({ role: "reader" }));
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const open = aRoleRequest({ role: "author", createdAt: "2026-09-01T09:00:00.000Z" });

/** A bank holding the Viewer's own Role Requests, newest first as the API sends them. */
function aBankHoldingMine(mine: RoleRequest[]) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/role-requests/mine"
        ? answersWith({ roleRequests: mine })
        : undefined,
  );
}

async function thePanel() {
  return within(await screen.findByRole("region", { name: "Your Role Request" }));
}

describe("Your Role Request on Home", () => {
  it("shows a Reader the role they asked for, still being decided", async () => {
    aBankHoldingMine([open]);
    renderTheWholeClient("/");

    const asked = (await thePanel()).getByRole("time");
    expect(asked).toHaveAttribute("datetime", open.createdAt);
    expect(asked.closest("p")).toHaveTextContent(
      /^You asked for the Author role on .+\. No Administrator has decided it yet\.$/,
    );
  });

  it("is the only panel of waiting work a Reader sees", async () => {
    aBankHoldingMine([open]);
    renderTheWholeClient("/");

    await thePanel();
    for (const other of [
      "Your Pending and Rejected Questions",
      "Waiting for your review",
      "Open Role Requests",
    ]) {
      expect(screen.queryByRole("region", { name: other })).toBeNull();
    }
  });

  it.each<[string, Viewer]>([
    ["an Author", aViewer({ role: "author" })],
    ["an Administrator", anAdministrator],
  ])("shows %s theirs too", async (_who, viewer) => {
    signInAs(viewer);
    aBankHoldingMine([open]);
    renderTheWholeClient("/");

    expect((await thePanel()).getByRole("time")).toHaveAttribute("datetime", open.createdAt);
  });

  it.each<[string, RoleRequest[]]>([
    ["has never asked", []],
    ["was granted the last one", [aRoleRequest({ state: "granted" })]],
    ["was denied the last one", [aRoleRequest({ state: "denied", reason: "Not yet." })]],
  ])("is not shown to a Viewer who %s", async (_who, mine) => {
    const api = aBankHoldingMine(mine);
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Recently added" });
    await waitFor(() =>
      expect(api.sent.map(({ url }) => new URL(url).pathname)).toContain("/api/role-requests/mine"),
    );
    expect(screen.queryByRole("region", { name: "Your Role Request" })).toBeNull();
  });

  it("is not shown while the list loads, so it never flashes up and vanishes", async () => {
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname === "/api/role-requests/mine" ? new Promise<Response>(() => {}) : undefined,
    );
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Recently added" });
    expect(screen.queryByRole("region", { name: "Your Role Request" })).toBeNull();
    expect(screen.queryByText("Loading your Role Requests…")).toBeNull();
  });

  it("says so when the list fails, and leaves the rest of Home working", async () => {
    let failing = true;
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname !== "/api/role-requests/mine") return undefined;
        return failing
          ? refusesWith(500, "internal_error", "Something went wrong on our side.")
          : answersWith({ roleRequests: [open] });
      },
    );
    renderTheWholeClient("/");

    const panel = await thePanel();
    expect(
      await panel.findByText("The Role Requests you raised could not be loaded"),
    ).toBeVisible();
    const recentlyAdded = within(screen.getByRole("region", { name: "Recently added" }));
    expect(await recentlyAdded.findByText("Nothing has been added to the bank yet.")).toBeVisible();

    failing = false;
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(panel.getByRole("time")).toHaveAttribute("datetime", open.createdAt),
    );
  });

  it("leads on to the account page, where it was raised", async () => {
    aBankHoldingMine([open]);
    renderTheWholeClient("/");

    await userEvent.click((await thePanel()).getByRole("link", { name: "See it on your account" }));
    expect(window.location.pathname).toBe("/account");
  });
});
