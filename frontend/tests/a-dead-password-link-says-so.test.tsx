import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { fakeApi, refusesWith } from "./helpers/fake-api";
import { setPasswordOnScreen } from "./helpers/set-password-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aGoodPassword = "correct-horse-battery-staple";

/** What the API answers for a link that is expired, used, or replaced by a newer one. */
const theRefusedLinkMessage = "This link is not valid. It may have expired or been used already.";

beforeEach(() => {
  replaceSession({ status: "signed-out" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** Nothing on the page can work once the link is spent, so the Viewer is shown where to
 * get a new one instead of a form. */
describe("a Password Link that no longer works", () => {
  it("replaces the form with the API's words and a way to ask for a new link", async () => {
    fakeApi(() => refusesWith(401, "unauthenticated", theRefusedLinkMessage));
    renderTheWholeClient("/set-password#token=a-spent-token");

    await setPasswordOnScreen(aGoodPassword, aGoodPassword);

    expect(await screen.findByText(theRefusedLinkMessage)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set my password" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Ask for a new link" }));
    expect(await screen.findByRole("button", { name: "Email me a link" })).toBeInTheDocument();
  });

  it("says so before anything is sent when the link carries no token", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    renderTheWholeClient("/set-password");

    expect(await screen.findByText(/This link is not complete/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(api.sent).toHaveLength(0);
  });
});
