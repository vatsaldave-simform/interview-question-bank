import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aRoleRequest, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
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

/** Answers the open Role Requests as the test says, and everything else the usual way. */
function aBankAnsweringTheRoleRequests(answer: () => Response): void {
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => (asked.pathname === "/api/role-requests" ? answer() : undefined),
  );
}

describe("the open Role Requests on the administration console", () => {
  it("lists who asked, the role they hold and want, and when, in the order the API sent", async () => {
    const older = aRoleRequest({
      viewer: { id: "7c3b4a1e-0000-4000-8000-000000000004", email: "reader@iqb.test" },
      heldRole: "reader",
      role: "reviewer",
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    const newer = aRoleRequest({
      id: "d0000000-0000-4000-8000-000000000002",
      viewer: { id: "7c3b4a1e-0000-4000-8000-000000000005", email: "author@iqb.test" },
      heldRole: "reader",
      role: "author",
      createdAt: "2026-09-02T09:00:00.000Z",
    });
    aBankAnsweringTheRoleRequests(() => answersWith({ roleRequests: [older, newer] }));

    renderTheWholeClient("/administration/role-requests");

    const list = await screen.findByRole("list", { name: "Open Role Requests" });
    const [first, second] = within(list).getAllByRole("article");
    expect(within(first!).getByRole("heading", { name: "reader@iqb.test" })).toBeVisible();
    expect(within(first!).getByText("Reader to Reviewer")).toBeVisible();
    expect(within(first!).getByText(/^Asked/)).toHaveTextContent("Asked Sep 1, 2026");
    expect(within(first!).getByRole("time")).toHaveAttribute("datetime", older.createdAt);
    for (const act of ["Grant", "Deny"]) {
      expect(within(first!).getByRole("button", { name: act })).toBeVisible();
    }
    expect(within(second!).getByRole("heading", { name: "author@iqb.test" })).toBeVisible();
    expect(within(second!).getByText("Reader to Author")).toBeVisible();
    expect(within(second!).getByRole("time")).toHaveAttribute("datetime", newer.createdAt);
  });

  it("says so when nothing is waiting", async () => {
    aBankAnsweringTheRoleRequests(() => answersWith({ roleRequests: [] }));

    renderTheWholeClient("/administration/role-requests");

    expect(await screen.findByRole("heading", { name: "No Role Request is open" })).toBeVisible();
  });

  it("reports the API's refusal, with no Try again", async () => {
    aBankAnsweringTheRoleRequests(() => refusesWith(403, "forbidden", "You may not do that."));

    renderTheWholeClient("/administration/role-requests");

    const section = within(await screen.findByRole("region", { name: "Role Requests" }));
    expect(await section.findByText("The bank refused to show the Role Requests")).toBeVisible();
    expect(section.getByText("You may not do that.")).toBeVisible();
    expect(section.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
