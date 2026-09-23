import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { replaceSession, useSession } from "@/platform/session";
import { aSignedInAuthor } from "./helpers/fake-api";

afterEach(() => {
  replaceSession({ status: "unknown" });
});

describe("a screen reading the session", () => {
  it("is told when the session changes under it", () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.status).toBe("unknown");

    act(() => {
      replaceSession({
        status: "signed-in",
        accessToken: aSignedInAuthor.accessToken,
        viewer: aSignedInAuthor.viewer,
      });
    });

    expect(result.current).toEqual({
      status: "signed-in",
      accessToken: aSignedInAuthor.accessToken,
      viewer: aSignedInAuthor.viewer,
    });
  });

  it("stops being told once it has gone away", () => {
    const { result, unmount } = renderHook(() => useSession());
    unmount();

    // Nothing should throw, and nothing should be re-rendered into a component that is
    // no longer there.
    act(() => {
      replaceSession({ status: "signed-out" });
    });

    expect(result.current.status).toBe("unknown");
  });
});
