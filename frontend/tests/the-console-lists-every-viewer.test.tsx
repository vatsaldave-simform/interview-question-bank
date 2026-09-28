import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aViewer, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const deactivatedAuthor = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000009",
  email: "left@iqb.test",
  isDeactivated: true,
});

/** Answers the Viewer list as the test says, and everything else the usual way. */
function aBankAnsweringTheViewers(answer: () => Response | undefined): void {
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => (asked.pathname === "/api/viewers" ? answer() : undefined),
  );
}

function rowFor(email: string): HTMLElement {
  const viewers = screen.getByRole("table", { name: "Viewers" });
  const row = within(viewers)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(email) !== null);
  if (row === undefined) throw new Error(`No row for ${email}.`);
  return row;
}

describe("the administration console", () => {
  it("lists every Viewer with their role, Administrator authority and Deactivated", async () => {
    signInAs(anAdministrator);
    aBankAnsweringTheViewers(() =>
      answersWith({ viewers: [deactivatedAuthor, anAdministrator] }),
    );

    renderTheWholeClient("/administration/viewers");

    expect(await screen.findByRole("table", { name: "Viewers" })).toBeVisible();
    const left = within(rowFor("left@iqb.test"));
    expect(left.getByRole("cell", { name: "author" })).toBeVisible();
    expect(left.getByRole("cell", { name: "No" })).toBeVisible();
    expect(left.getByRole("cell", { name: "Deactivated" })).toBeVisible();
    const administrator = within(rowFor("reviewer@iqb.test"));
    expect(administrator.getByRole("cell", { name: "reviewer" })).toBeVisible();
    expect(administrator.getByRole("cell", { name: "Yes" })).toBeVisible();
    expect(administrator.getByRole("cell", { name: "Active" })).toBeVisible();
  });

  // The client does not check the authority itself: whoever opens the address is shown
  // what the API answered, which is also right for an Administrator whose authority was
  // withdrawn while their session still says they hold it.
  it("reports the API's refusal, with no Try again, when it refuses the list", async () => {
    signInAs();
    aBankAnsweringTheViewers(() => refusesWith(403, "forbidden", "You may not do that."));

    renderTheWholeClient("/administration/viewers");

    expect(await screen.findByText("The bank refused to show the Viewers")).toBeVisible();
    expect(screen.getByText("You may not do that.")).toBeVisible();
    expect(screen.queryByRole("table", { name: "Viewers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows any other failure in the API's own words, and asks again on Try again", async () => {
    signInAs(anAdministrator);
    const answers = [
      refusesWith(500, "internal_error", "Something went wrong on our side."),
      answersWith({ viewers: [anAdministrator] }),
    ];
    aBankAnsweringTheViewers(() => answers.shift());

    renderTheWholeClient("/administration/viewers");

    expect(await screen.findByText("Something went wrong on our side.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Viewers" })).toBeVisible();
    expect(rowFor("reviewer@iqb.test")).toBeVisible();
  });
});

describe("the link to the administration console", () => {
  it("is shown to an Administrator, and opens the console", async () => {
    signInAs(anAdministrator);
    aBankAnsweringTheViewers(() => undefined);
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("link", { name: "Administration" }));

    expect(await screen.findByText("No Role Request is waiting.")).toBeVisible();
    expect(window.location.pathname).toBe("/administration/role-requests");
  });

  it("is not shown to a Viewer without the Administrator authority", async () => {
    signInAs();
    aBankAnsweringTheViewers(() => undefined);

    renderTheWholeClient("/");

    expect(await screen.findByRole("banner")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  });
});
