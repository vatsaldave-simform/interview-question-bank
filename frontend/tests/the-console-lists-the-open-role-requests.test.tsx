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
  it("lists who asked, for which role and when, in the order the API sent", async () => {
    const older = aRoleRequest({
      viewer: { id: "7c3b4a1e-0000-4000-8000-000000000004", email: "reader@iqb.test" },
      role: "reviewer",
      createdAt: "2026-09-01T09:00:00.000Z",
    });
    const newer = aRoleRequest({
      id: "d0000000-0000-4000-8000-000000000002",
      viewer: { id: "7c3b4a1e-0000-4000-8000-000000000005", email: "author@iqb.test" },
      role: "author",
      createdAt: "2026-09-02T09:00:00.000Z",
    });
    aBankAnsweringTheRoleRequests(() => answersWith({ roleRequests: [older, newer] }));

    renderTheWholeClient("/administration");

    const table = await screen.findByRole("table", { name: "Open Role Requests" });
    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first!).getByRole("cell", { name: "reader@iqb.test" })).toBeVisible();
    expect(within(first!).getByRole("cell", { name: "reviewer" })).toBeVisible();
    expect(within(first!).getByRole("time")).toHaveAttribute("datetime", older.createdAt);
    expect(within(second!).getByRole("cell", { name: "author@iqb.test" })).toBeVisible();
    expect(within(second!).getByRole("cell", { name: "author" })).toBeVisible();
    expect(within(second!).getByRole("time")).toHaveAttribute("datetime", newer.createdAt);
  });

  it("says so when nothing is waiting", async () => {
    aBankAnsweringTheRoleRequests(() => answersWith({ roleRequests: [] }));

    renderTheWholeClient("/administration");

    expect(await screen.findByText("No Role Request is waiting.")).toBeVisible();
  });

  it("reports the API's refusal, with no Try again", async () => {
    aBankAnsweringTheRoleRequests(() => refusesWith(403, "forbidden", "You may not do that."));

    renderTheWholeClient("/administration");

    const section = within(await screen.findByRole("region", { name: "Open Role Requests" }));
    expect(await section.findByText("The bank refused to show the Role Requests")).toBeVisible();
    expect(section.getByText("You may not do that.")).toBeVisible();
    expect(section.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
