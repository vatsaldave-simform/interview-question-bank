import type { RoleRequest, Viewer } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import {
  aRoleRequest,
  aViewer,
  anAdministrator,
  answersWith,
  refusesWith,
} from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const open = aRoleRequest({
  viewer: { id: "7c3b4a1e-0000-4000-8000-000000000004", email: "reader@iqb.test" },
  role: "author",
  heldRole: "reader",
  createdAt: "2026-09-01T09:00:00.000Z",
});

/** A bank whose open Role Requests are `roleRequests`. */
function aBankWithOpen(roleRequests: RoleRequest[]) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/role-requests" ? answersWith({ roleRequests }) : undefined,
  );
}

async function thePanel() {
  return within(await screen.findByRole("region", { name: "Open Role Requests" }));
}

describe("Open Role Requests on Home", () => {
  it("lists who asked, for which role and when", async () => {
    signInAs(anAdministrator);
    aBankWithOpen([open]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const row = within((await panel.findByText("reader@iqb.test")).closest("li")!);
    expect(row.getByText("Reader to Author")).toBeVisible();
    expect(row.getByText(/^Asked/)).toHaveTextContent("Asked Sep 1, 2026");
    expect(row.getByRole("time")).toHaveAttribute("datetime", open.createdAt);
  });

  it("opens the Role Requests page from a Role Request", async () => {
    signInAs(anAdministrator);
    aBankWithOpen([open]);
    renderTheWholeClient("/");

    await userEvent.click(await (await thePanel()).findByRole("link", { name: "reader@iqb.test" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Role Requests" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/administration/role-requests");
  });

  it("is shown to an Administrator whatever role they hold", async () => {
    signInAs(aViewer({ role: "reader", isAdministrator: true }));
    aBankWithOpen([open]);
    renderTheWholeClient("/");

    expect(await (await thePanel()).findByText("reader@iqb.test")).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["a Reviewer who is not an Administrator", aViewer({ role: "reviewer" })],
  ])("is not shown to %s", async (_who, viewer) => {
    signInAs(viewer);
    aBankWithOpen([open]);
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Recently added" });
    expect(screen.queryByRole("region", { name: "Open Role Requests" })).toBeNull();
  });

  it("says so when no Role Request is waiting", async () => {
    signInAs(anAdministrator);
    aBankWithOpen([]);
    renderTheWholeClient("/");

    const panel = await thePanel();
    const nobody = "No Role Request is open. Nobody is waiting on you.";
    expect(await panel.findByText(nobody)).toBeVisible();
  });

  it("says so when the list fails, and leaves the other panels working", async () => {
    signInAs(anAdministrator);
    let failing = true;
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname !== "/api/role-requests") return undefined;
        return failing
          ? refusesWith(500, "internal_error", "Something went wrong on our side.")
          : answersWith({ roleRequests: [open] });
      },
    );
    renderTheWholeClient("/");

    const panel = await thePanel();
    expect(await panel.findByText("The Role Requests could not be loaded")).toBeVisible();
    const review = within(screen.getByRole("region", { name: "Waiting for your review" }));
    expect(
      await review.findByText(
        "Nothing is waiting for review. New Questions appear here when an Author sends them.",
      ),
    ).toBeVisible();

    failing = false;
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(panel.getByText("reader@iqb.test")).toBeVisible());
  });

  it("shows the five waiting longest, and leads on to where they are decided", async () => {
    signInAs(anAdministrator);
    const six = Array.from({ length: 6 }, (_, at) =>
      aRoleRequest({
        id: `d0000000-0000-4000-8000-00000000001${at}`,
        viewer: { id: `7c3b4a1e-0000-4000-8000-00000000001${at}`, email: `asker${at}@iqb.test` },
      }),
    );
    aBankWithOpen(six);
    renderTheWholeClient("/");

    const panel = await thePanel();
    await panel.findByText("asker0@iqb.test");
    expect(panel.getAllByText(/^asker\d@iqb\.test$/).map((email) => email.textContent)).toEqual(
      six.slice(0, 5).map(({ viewer }) => viewer.email),
    );

    await userEvent.click(panel.getByRole("link", { name: "Decide them" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Role Requests" }),
    ).toBeVisible();
    expect(window.location.pathname).toBe("/administration/role-requests");
  });
});
