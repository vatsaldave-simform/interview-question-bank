import { currentViewerResponseSchema, loginResponseSchema } from "@iqb/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiFailure, callApi } from "@/platform/api-client";
import { fakeApi, refusesWith } from "./helpers/fake-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Narrower than `rejects.toThrow`: the login screen shows what this carries, so the
 * fields matter, not just the throw. */
async function refusalFrom(call: Promise<unknown>): Promise<ApiFailure> {
  try {
    await call;
  } catch (thrown) {
    if (thrown instanceof ApiFailure) return thrown;
    throw thrown;
  }
  throw new Error("The call was expected to be refused, and was not.");
}

describe("a refusal from the API", () => {
  it("carries the API's own code and message, so a screen can show them", async () => {
    fakeApi(() => refusesWith(401, "unauthenticated", "Those credentials are not valid."));

    const refused = await refusalFrom(callApi("/api/auth/login", loginResponseSchema));

    expect(refused.status).toBe(401);
    expect(refused.code).toBe("unauthenticated");
    expect(refused.message).toBe("Those credentials are not valid.");
  });

  it("keeps the details the API sent with it", async () => {
    fakeApi(() =>
      refusesWith(400, "invalid_request", "No such Tag.", { tags: ["technology/rust"] }),
    );

    const refused = await refusalFrom(callApi("/api/questions", currentViewerResponseSchema));

    expect(refused.details).toEqual({ tags: ["technology/rust"] });
  });

  it("says so plainly when something that is not the API answered", async () => {
    // What a proxy or a gateway sends while the free tier is waking up. Reporting its
    // HTML as the message would put markup in front of a person (ADR-0012).
    fakeApi(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const refused = await refusalFrom(callApi("/api/auth/refresh", loginResponseSchema));

    expect(refused.status).toBe(502);
    expect(refused.message).toBe("The bank answered, but not in a way this client understands.");
    expect(refused.unanswered).toBe(false);
  });

  it("tells a caller when no answer arrived at all", async () => {
    fakeApi(() => {
      throw new TypeError("Failed to fetch");
    });

    const refused = await refusalFrom(callApi("/api/auth/refresh", loginResponseSchema));

    expect(refused.unanswered).toBe(true);
    expect(refused.message).toBe("The bank could not be reached.");
  });

  it("lets an abort through as an abort, because nobody is waiting for that answer", async () => {
    fakeApi(() => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    // A screen that went away or a query key that changed cancels its own request, and
    // reporting that to anyone as a failure would be a lie.
    await expect(callApi("/api/auth/refresh", loginResponseSchema)).rejects.toThrow(DOMException);
  });
});
