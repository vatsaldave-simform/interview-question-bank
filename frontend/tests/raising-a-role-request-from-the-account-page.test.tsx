import type { RoleRequest, ViewerRole } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aRoleRequest, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

// Signed in as the usual Author.
beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

function aNewOne(role: ViewerRole): Response {
  const roleRequest = aRoleRequest({ id: "d0000000-0000-4000-8000-00000000000a", role });
  return answersWith({ roleRequest }, 201);
}

/** A bank holding the signed-in Viewer's own Role Requests, newest first as the API sends
 * them, which answers a new one with `raised` and puts it first. */
function aBankHoldingMine(mine: RoleRequest[], raised: (role: ViewerRole) => Response = aNewOne) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/role-requests/mine") return answersWith({ roleRequests: mine });
      if (asked.pathname !== "/api/role-requests" || request.method !== "POST") return undefined;
      const { role } = (await request.json()) as { role: ViewerRole };
      const answer = raised(role);
      if (answer.ok) {
        mine.unshift(((await answer.clone().json()) as { roleRequest: RoleRequest }).roleRequest);
      }
      return answer;
    },
  );
}

async function theRoleRequestSection() {
  return within(await screen.findByRole("region", { name: "Role Request" }));
}

describe("a Viewer's own Role Request on their account page", () => {
  it("opens from the email in the header, and shows who is signed in", async () => {
    aBankHoldingMine([]);
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("link", { name: "author@iqb.test" }));

    expect(await screen.findByRole("heading", { name: "Your account" })).toBeVisible();
    const page = within(screen.getByRole("main"));
    expect(page.getByText("author@iqb.test")).toBeVisible();
    expect(page.getByText("Author")).toBeVisible();
    const section = await theRoleRequestSection();
    expect(await section.findByText("You have not asked for a different role.")).toBeVisible();
  });

  it.each([
    { state: "open", reads: "It is waiting for an Administrator.", offersAnother: false },
    { state: "granted", reads: "It was granted.", offersAnother: true },
    { state: "denied", reads: "It was denied.", offersAnother: true },
  ] as const)("shows a request that is $state as such", async ({ state, reads, offersAnother }) => {
    aBankHoldingMine([
      aRoleRequest({
        role: "reviewer",
        state,
        reason: state === "denied" ? "Review a few Questions first." : null,
      }),
    ]);
    renderTheWholeClient("/account");

    const section = await theRoleRequestSection();
    expect(await section.findByText(/You asked to be a Reviewer/)).toBeVisible();
    expect(section.getByText(reads)).toBeVisible();
    if (state === "denied") {
      expect(section.getByText("Review a few Questions first.")).toBeVisible();
    }
    // Only one may be open at a time, so the form waits until this one is decided.
    expect(section.queryByLabelText("Role to ask for") !== null).toBe(offersAnother);
  });

  it("raises a Role Request for a role not held, which then reads as open", async () => {
    const api = aBankHoldingMine([]);
    renderTheWholeClient("/account");

    const section = await theRoleRequestSection();
    const picker = await section.findByLabelText("Role to ask for");
    const offered = within(picker).getAllByRole("option").map((option) => option.textContent);
    expect(offered).toEqual(["Reader", "Reviewer"]);
    await userEvent.selectOptions(picker, "Reviewer");
    await userEvent.click(section.getByRole("button", { name: "Ask for this role" }));

    expect(await section.findByText("It is waiting for an Administrator.")).toBeVisible();
    expect(section.queryByLabelText("Role to ask for")).not.toBeInTheDocument();
    const [sent] = api.sent.filter((request) => request.method === "POST");
    expect(new URL(sent!.url).pathname).toBe("/api/role-requests");
    expect(await sent!.json()).toEqual({ role: "reviewer" });
  });

  it("reports the API's refusal in its own words", async () => {
    aBankHoldingMine([], () =>
      refusesWith(409, "conflict", "You already have an open Role Request."),
    );
    renderTheWholeClient("/account");

    const section = await theRoleRequestSection();
    await userEvent.click(await section.findByRole("button", { name: "Ask for this role" }));

    const alert = within(await section.findByRole("alert"));
    expect(alert.getByText("The Role Request was not sent.")).toBeVisible();
    expect(alert.getByText("You already have an open Role Request.")).toBeVisible();
  });
});
