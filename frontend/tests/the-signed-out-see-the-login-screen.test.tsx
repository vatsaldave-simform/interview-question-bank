import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("who sees what", () => {
  it("shows the login screen to a Viewer with no session", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    replaceSession({ status: "signed-out" });

    renderTheWholeClient();

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the shell, with the address and the role, to a Viewer who has one", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    replaceSession({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });

    renderTheWholeClient();

    expect(await screen.findByText("author@iqb.test")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    // The shell has an outlet and something is in it: the landing route rendered.
    expect(screen.getByText("You are signed in")).toBeInTheDocument();
  });

  it("hands the login screen straight over while the silent sign-in is still going", async () => {
    // The wait can be the minute it takes the free tier to wake (ADR-0012). Holding the
    // login screen back for it would hide the very page that explains the wait.
    fakeApi(() => new Promise<Response>(() => {}));

    renderTheWholeClient("/login");

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("waits while the silent sign-in is still going rather than bouncing anyone", async () => {
    // The session starts unknown and stays there: the refresh never answers.
    fakeApi(() => new Promise<Response>(() => {}));

    renderTheWholeClient();

    await waitFor(() => expect(screen.getByText(/Checking whether you/)).toBeInTheDocument());
    // The bug this is here to catch: a Viewer whose session is about to come back being
    // shown the login screen for a beat first (ADR-0008).
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
