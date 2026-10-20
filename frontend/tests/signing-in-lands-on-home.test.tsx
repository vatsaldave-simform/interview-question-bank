import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { findHome } from "./helpers/home-page";
import { signInOnScreen } from "./helpers/login-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("is where signing in lands", async () => {
    fakeBank((asked) => aPageOf([], asked));
    replaceSession({ status: "signed-out" });
    renderTheWholeClient("/login");

    await signInOnScreen("author@iqb.test", "author-password");

    expect(await findHome()).toBeVisible();
    expect(window.location.pathname).toBe("/");
  });

  it("is where the login screen sends a Viewer who is already signed in", async () => {
    fakeBank((asked) => aPageOf([], asked));
    signInAs();
    renderTheWholeClient("/login");

    expect(await findHome()).toBeVisible();
    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

});
