import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/features/auth/login-screen";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";
import { signInOnScreen } from "./helpers/login-screen";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/**
 * The form checks with `loginRequestSchema`, the same object the API checks the request
 * with (ADR-0010). What that buys is here: a request the API would certainly refuse never
 * leaves the browser, and the Viewer is told straight away rather than after a round trip
 * to a service that may still be waking up.
 */
describe("the login form", () => {
  it("sends nothing when the address is not an address", async () => {
    const api = fakeApi(() => answersWith(aSignedInAuthor));
    render(<LoginScreen />);

    await signInOnScreen("author", "author-password");

    expect(screen.getByText("Enter an email address, like author@iqb.test.")).toBeInTheDocument();
    expect(api.sent).toHaveLength(0);
  });

  it("sends nothing when the password is empty", async () => {
    const api = fakeApi(() => answersWith(aSignedInAuthor));
    render(<LoginScreen />);

    await signInOnScreen("author@iqb.test", "");

    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(api.sent).toHaveLength(0);
  });

  it("marks the field the schema rejected, and only that one", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    render(<LoginScreen />);

    await signInOnScreen("author", "author-password");

    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false");
  });

  it("puts the cursor on the first field it rejected", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    render(<LoginScreen />);

    // Nothing typed at all, so both fields are wrong and the email is the one to go to.
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter an email address, like author@iqb.test.",
    );
  });
});
