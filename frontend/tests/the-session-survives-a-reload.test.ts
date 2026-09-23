import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverSession, signIn, signOut, stopRenewingSession } from "@/features/auth/sign-in";
import { currentSession, replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi, refusesWith } from "./helpers/fake-api";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a session recovered on load", () => {
  it("comes back from the refresh cookie alone", async () => {
    // A reload leaves no access token, because it was only ever in memory. The cookie
    // is what is left, and it is enough (ADR-0008).
    const api = fakeApi(() => answersWith(aSignedInAuthor));

    await recoverSession();

    expect(api.sent[0]!.url).toContain("/api/auth/refresh");
    expect(currentSession()).toEqual({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });
  });

  it("settles into signed out when there is no cookie to recover from", async () => {
    fakeApi(() => refusesWith(401, "unauthenticated", "There is no session to refresh."));

    await recoverSession();

    // Signed out, not stuck on unknown: the sign-in check waits on unknown, so never
    // leaving it would leave a first-time visitor looking at nothing.
    expect(currentSession()).toEqual({ status: "signed-out" });
  });

  it("settles into signed out when the bank cannot be reached at all", async () => {
    fakeApi(() => {
      throw new TypeError("Failed to fetch");
    });

    await recoverSession();

    expect(currentSession()).toEqual({ status: "signed-out" });
  });
});

describe("a session that is being kept alive", () => {
  it("asks for a new token before the one it holds expires", async () => {
    vi.useFakeTimers();
    const api = fakeApi(() => answersWith({ ...aSignedInAuthor, expiresInSeconds: 900 }));
    await signIn({ email: "author@iqb.test", password: "author-password" });
    expect(api.sent).toHaveLength(1);

    // A minute before the fifteen are up, and not a moment after: finding out through a
    // request that failed is what expiresInSeconds exists to avoid.
    await vi.advanceTimersByTimeAsync(839 * 1000);
    expect(api.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1 * 1000);

    expect(api.sent).toHaveLength(2);
    expect(api.sent[1]!.url).toContain("/api/auth/refresh");
  });

  it("stops asking once the session has ended", async () => {
    vi.useFakeTimers();
    fakeApi(() => answersWith(aSignedInAuthor));
    await signIn({ email: "author@iqb.test", password: "author-password" });

    const api = fakeApi(() => new Response(null, { status: 204 }));
    await signOut();
    await vi.advanceTimersByTimeAsync(900 * 1000);

    // One call, the logout. A timer left running would sign the Viewer back in after
    // they asked to leave.
    expect(api.sent).toHaveLength(1);
    expect(currentSession()).toEqual({ status: "signed-out" });
  });
});

describe("logging out", () => {
  it("ends the session here even when the request never arrives", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    await signIn({ email: "author@iqb.test", password: "author-password" });

    fakeApi(() => {
      throw new TypeError("Failed to fetch");
    });
    await signOut();

    expect(currentSession()).toEqual({ status: "signed-out" });
  });
});
