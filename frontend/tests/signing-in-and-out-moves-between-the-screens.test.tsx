import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { currentSession, replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";
import { signInOnScreen } from "./helpers/login-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/**
 * Nothing on either screen navigates. The session changes, the sign-in check runs again,
 * and the router moves — which is why logging out from a screen that knows nothing about
 * routing still lands on the login screen.
 */
describe("the screen a Viewer is on", () => {
  it("becomes the shell when they sign in", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    replaceSession({ status: "signed-out" });
    renderTheWholeClient();
    await screen.findByRole("button", { name: "Sign in" });

    await signInOnScreen("author@iqb.test", "author-password");

    expect(await screen.findByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByText("author@iqb.test")).toBeInTheDocument();
  });

  it("becomes the login screen when they log out", async () => {
    fakeApi((request) =>
      request.url.endsWith("/logout")
        ? new Response(null, { status: 204 })
        : answersWith(aSignedInAuthor),
    );
    replaceSession({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });
    renderTheWholeClient();

    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    await waitFor(() => expect(currentSession()).toEqual({ status: "signed-out" }));
  });
});
