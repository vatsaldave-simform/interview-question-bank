import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recoverSession, signIn, signOut, stopRenewingSession } from "@/features/auth/sign-in";
import { accessToken, replaceSession } from "@/platform/session";
import { aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The one criterion of #13 that nothing else would notice breaking. An access token in
 * localStorage is readable by any script that gets onto the page, which is the whole
 * reason ADR-0008 keeps it in memory and puts the long-lived half in an httpOnly cookie.
 * A later ticket adding a "remember me" checkbox is what this is here to catch.
 */
describe("the access token", () => {
  it("is never written to any browser storage, through a whole session", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    fakeApi(() => answersWith(aSignedInAuthor));

    await signIn({ email: "author@iqb.test", password: "author-password" });
    await recoverSession();
    await signOut();

    expect(local).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("is gone from memory once the session ends", async () => {
    fakeApi(() => answersWith(aSignedInAuthor));
    await signIn({ email: "author@iqb.test", password: "author-password" });
    expect(accessToken()).toBe(aSignedInAuthor.accessToken);

    fakeApi(() => new Response(null, { status: 204 }));
    await signOut();

    expect(accessToken()).toBeNull();
  });
});
