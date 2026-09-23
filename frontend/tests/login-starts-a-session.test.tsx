import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/features/auth/login-screen";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { currentSession, replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";
import { signInOnScreen } from "./helpers/login-screen";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("a Viewer signing in", () => {
  it("ends up with a session, from credentials the schema tidied first", async () => {
    const api = fakeApi(() => answersWith(aSignedInAuthor));
    render(<LoginScreen />);

    // Typed the way a person types: a capital and a stray space at the end. The schema
    // trims and lower-cases, so the address is matched the same way wherever it came from.
    await signInOnScreen("Author@IQB.test ", "author-password");

    await waitFor(() => expect(api.sent).toHaveLength(1));
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
