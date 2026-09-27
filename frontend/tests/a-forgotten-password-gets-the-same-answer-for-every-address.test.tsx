import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { fakeApi, refusesWith, type FakeApi } from "./helpers/fake-api";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "signed-out" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** What the API answers every reset request with, whatever address it was given. */
function answersEveryAddressAlike(): FakeApi {
  return fakeApi(() => new Response(null, { status: 202 }));
}

async function askForALink(email: string): Promise<void> {
  if (email !== "") await userEvent.type(await screen.findByLabelText("Email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));
}

describe("the forgotten-password page", () => {
  it("is open to a visitor with no session, from a link on the login screen", async () => {
    answersEveryAddressAlike();
    renderTheWholeClient("/login");

    await userEvent.click(await screen.findByRole("link", { name: "Forgotten your password?" }));

    expect(await screen.findByRole("button", { name: "Email me a link" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/forgotten-password");
  });

  it("sends the address the way the schema tidied it", async () => {
    const api = answersEveryAddressAlike();
    renderTheWholeClient("/forgotten-password");

    await askForALink("Reader@IQB.test ");

    await waitFor(() => expect(api.sent).toHaveLength(1));
    expect(api.sent[0]!.method).toBe("POST");
    expect(new URL(api.sent[0]!.url).pathname).toBe("/api/auth/password-reset");
    expect(await api.sent[0]!.json()).toEqual({ email: "reader@iqb.test" });
  });

  /** The API answers every address alike (ADR-0016), so a page that worded any of them
   * differently, or read the address back, would give away what the API keeps. */
  it("says the same words for every address, and never shows the address back", async () => {
    answersEveryAddressAlike();

    const seen: string[] = [];
    for (const email of ["reader@iqb.test", "nobody-here@iqb.test"]) {
      const { container, unmount } = renderTheWholeClient("/forgotten-password");
      await askForALink(email);
      await screen.findByText(/Check your email/);

      expect(container).not.toHaveTextContent(email);
      expect(screen.queryByRole("button", { name: "Email me a link" })).not.toBeInTheDocument();
      seen.push(container.textContent);
      unmount();
    }

    expect(seen[0]).toBe(seen[1]);
  });

  it("sends nothing when the address is not an address", async () => {
    const api = answersEveryAddressAlike();
    renderTheWholeClient("/forgotten-password");

    await askForALink("reader");

    expect(screen.getByText("Enter an email address, like author@iqb.test.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(api.sent).toHaveLength(0);
  });

  it("shows a rate limit in the API's words, and keeps the form", async () => {
    fakeApi(() => refusesWith(429, "rate_limited", "Too many attempts. Try again in a minute."));
    renderTheWholeClient("/forgotten-password");

    await askForALink("reader@iqb.test");

    expect(
      await screen.findByText("Too many attempts. Try again in a minute."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeInTheDocument();
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument();
  });
});
