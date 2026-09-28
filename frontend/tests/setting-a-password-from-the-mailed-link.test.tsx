import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { currentSession, replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi, refusesWith } from "./helpers/fake-api";
import { signInOnScreen } from "./helpers/login-screen";
import { setPasswordOnScreen } from "./helpers/set-password-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

/** The shape `passwordLinkUrl` in the backend mails out. */
const theMailedLink = "/set-password#token=a-token-from-the-mail";

const aGoodPassword = "correct-horse-battery-staple";

beforeEach(() => {
  replaceSession({ status: "signed-out" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("the set-password page", () => {
  it("is open to a visitor with no session, and sends the token from the link", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen(aGoodPassword, aGoodPassword);

    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(api.sent[0]!.method).toBe("POST");
    expect(new URL(api.sent[0]!.url).pathname).toBe("/api/auth/set-password");
    expect(await api.sent[0]!.json()).toEqual({
      token: "a-token-from-the-mail",
      password: aGoodPassword,
    });
  });

  it("sends nothing when the password is shorter than 15 characters", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen("too-short", "too-short");

    expect(
      screen.getByText("Use at least 15 characters, and no more than 128."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveFocus();
    expect(api.sent).toHaveLength(0);
  });

  it("sends nothing when the two passwords differ", async () => {
    const api = fakeApi(() => new Response(null, { status: 204 }));
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen(aGoodPassword, `${aGoodPassword}!`);

    expect(screen.getByText("Type the same password again.")).toBeInTheDocument();
    expect(screen.getByLabelText("The same password again")).toHaveFocus();
    expect(api.sent).toHaveLength(0);
  });

  it("shows a rate limit in the API's words, and keeps the form", async () => {
    fakeApi(() => refusesWith(429, "rate_limited", "Too many attempts. Try again in a minute."));
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen(aGoodPassword, aGoodPassword);

    expect(
      await screen.findByText("Too many attempts. Try again in a minute."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set my password" })).toBeInTheDocument();
  });

  it("leads to the login screen saying so, and from there into the bank", async () => {
    fakeApi((request) => {
      if (request.url.endsWith("/api/auth/set-password")) {
        return new Response(null, { status: 204 });
      }
      if (request.url.endsWith("/api/auth/login")) return answersWith(aSignedInAuthor);
      return new Promise<Response>(() => {});
    });
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen(aGoodPassword, aGoodPassword);

    expect(await screen.findByText("Your password is set.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");

    await signInOnScreen("author@iqb.test", aGoodPassword);

    expect(await screen.findByRole("button", { name: "author@iqb.test" })).toBeInTheDocument();
  });

  it("logs out whoever was signed in here, so the link's owner signs in fresh", async () => {
    const api = fakeApi((request) =>
      request.url.endsWith("/api/auth/set-password") || request.url.endsWith("/api/auth/logout")
        ? new Response(null, { status: 204 })
        : new Promise<Response>(() => {}),
    );
    replaceSession({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });
    renderTheWholeClient(theMailedLink);

    await setPasswordOnScreen(aGoodPassword, aGoodPassword);

    expect(await screen.findByText("Your password is set.")).toBeInTheDocument();
    expect(currentSession()).toEqual({ status: "signed-out" });
    expect(api.sent.map((request) => new URL(request.url).pathname)).toContain("/api/auth/logout");
  });

  it("does not say the password is set on an ordinary visit to the login screen", async () => {
    renderTheWholeClient("/login");

    await screen.findByRole("button", { name: "Sign in" });
    expect(screen.queryByText("Your password is set.")).not.toBeInTheDocument();
  });
});
