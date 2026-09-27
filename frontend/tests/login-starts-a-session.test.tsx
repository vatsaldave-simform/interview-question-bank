import { waitFor } from "@testing-library/react";
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

describe("a Viewer signing in", () => {
  it("ends up with a session, from credentials the schema tidied first", async () => {
    // Only the login is answered. Once signed in, the client moves on to the bank and asks
    // for it, and those requests are not what this test is about.
    const api = fakeApi((request) =>
      request.url.endsWith("/api/auth/login")
        ? answersWith(aSignedInAuthor)
        : new Promise<Response>(() => {}),
    );
    renderTheWholeClient("/login");

    // Typed the way a person types: a capital and a stray space at the end. The schema
    // trims and lower-cases, so the address is matched the same way wherever it came from.
    await signInOnScreen("Author@IQB.test ", "author-password");

    await waitFor(() => expect(currentSession().status).toBe("signed-in"));
    expect(api.sent[0]!.url).toContain("/api/auth/login");
    expect(await api.sent[0]!.json()).toEqual({
      email: "author@iqb.test",
      password: "author-password",
    });
    expect(currentSession()).toEqual({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });
  });
});
