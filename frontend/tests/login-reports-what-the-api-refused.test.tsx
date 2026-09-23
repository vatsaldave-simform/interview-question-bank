import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/features/auth/login-screen";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { currentSession, replaceSession } from "@/platform/session";
import { refusesWith, fakeApi } from "./helpers/fake-api";
import { signInOnScreen } from "./helpers/login-screen";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/**
 * The API decides why a sign-in failed and says so in words meant for a person. A client
 * that invents its own wording tells a rate-limited Viewer their password is wrong, which
 * is the one thing they cannot fix by trying harder (ADR-0021).
 */
describe("a sign-in the API refused", () => {
  it("shows the API's own message rather than one of its own", async () => {
    fakeApi(() =>
      refusesWith(401, "unauthenticated", "That email address and password do not match."),
    );
    render(<LoginScreen />);

    await signInOnScreen("author@iqb.test", "the-wrong-password");

    expect(
      await screen.findByText("That email address and password do not match."),
    ).toBeInTheDocument();
    expect(currentSession()).toEqual({ status: "unknown" });
  });

  it("says the bank is unreachable when nothing answered at all", async () => {
    fakeApi(() => {
      throw new TypeError("Failed to fetch");
    });
    render(<LoginScreen />);

    await signInOnScreen("author@iqb.test", "author-password");

    // What a cold start looks like from here, and the notice above the form is what
    // makes the wait readable (ADR-0012).
    expect(await screen.findByText("The bank could not be reached.")).toBeInTheDocument();
  });

  it("lets the Viewer try again, with the refusal cleared", async () => {
    const refusals = [
      refusesWith(429, "rate_limited", "Too many attempts. Try again in a minute."),
      refusesWith(401, "unauthenticated", "That email address and password do not match."),
    ];
    fakeApi(() => refusals.shift()!);
    render(<LoginScreen />);

    await signInOnScreen("author@iqb.test", "author-password");
    expect(await screen.findByText("Too many attempts. Try again in a minute.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("That email address and password do not match."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Too many attempts. Try again in a minute.")).not.toBeInTheDocument();
  });
});
