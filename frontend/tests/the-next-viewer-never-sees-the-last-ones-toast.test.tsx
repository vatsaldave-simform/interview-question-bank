import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { signInOnScreen } from "./helpers/login-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";
import { theToastSaying, toastsShown } from "./helpers/toasts";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("two Viewers taking turns in one tab", () => {
  it("never shows the second one a toast raised for the first one", async () => {
    fakeBank(
      (asked) => aPageOf([], asked),
      (request, asked) =>
        asked.pathname === "/api/clients" && request.method === "POST"
          ? answersWith({ client: aClient({ name: "Kingsbridge Health" }) }, 201)
          : undefined,
    );
    signInAs(anAdministrator);
    renderTheWholeClient("/administration/clients");

    await userEvent.click(await screen.findByRole("button", { name: "Add a Client" }));
    const form = within(await screen.findByRole("form", { name: "Create a Client" }));
    await userEvent.type(form.getByLabelText("Name"), "Kingsbridge Health");
    await userEvent.click(form.getByRole("button", { name: "Create" }));
    await theToastSaying("Kingsbridge Health was created.");

    // Logged out while the toast is still showing, before it had time to go by itself.
    await userEvent.click(screen.getByRole("button", { name: anAdministrator.email }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));
    await signInOnScreen("author@iqb.test", "author-password");
    await screen.findByRole("button", { name: "author@iqb.test" });
    // Sonner hands a new toaster the toasts it still holds a moment after it mounts.
    await act(() => new Promise((wait) => setTimeout(wait, 50)));

    expect(toastsShown()).toHaveLength(0);
  });
});
