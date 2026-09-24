import { loginResponseSchema } from "@iqb/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { callApi, callApiWithoutAnswer } from "@/platform/api-client";
import { replaceSession } from "@/platform/session";
import { answersWith, fakeApi } from "./helpers/fake-api";

const aLogin = {
  accessToken: "a-signed-token",
  expiresInSeconds: 900,
  viewer: {
    id: "7c3b4a1e-0000-4000-8000-000000000001",
    email: "author@iqb.test",
    role: "author" as const,
    isAdministrator: false,
  },
};

afterEach(() => {
  replaceSession({ status: "unknown" });
  vi.unstubAllGlobals();
});

describe("the API client", () => {
  it("parses the answer with the schema it was given", async () => {
    fakeApi(() => answersWith(aLogin));

    expect(await callApi("/api/auth/login", loginResponseSchema)).toEqual(aLogin);
  });

  it("refuses an answer that does not match the schema", async () => {
    fakeApi(() => answersWith({ ...aLogin, expiresInSeconds: "soon" }));

    // The client and the API out of sync is the failure the shared package exists to
    // catch, so it is louder here than a missing field would be downstream.
    await expect(callApi("/api/auth/login", loginResponseSchema)).rejects.toThrow();
  });

  it("sends a body as JSON, and says so", async () => {
    const api = fakeApi(() => answersWith(aLogin));

    await callApi("/api/auth/login", loginResponseSchema, {
      method: "POST",
      body: { email: "author@iqb.test", password: "author-password" },
    });

    const sent = api.sent[0]!;
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("content-type")).toBe("application/json");
    expect(await sent.json()).toEqual({
      email: "author@iqb.test",
      password: "author-password",
    });
  });

  it("sends the cookie, which is the whole of how a session is recovered", async () => {
    const api = fakeApi(() => answersWith(aLogin));

    await callApi("/api/auth/refresh", loginResponseSchema, { method: "POST" });

    // Same-origin rather than omit: the refresh cookie is httpOnly and travels on its
    // own, and a client that dropped it could never recover a session (ADR-0008).
    expect(api.asked[0]!.init.credentials).toBe("same-origin");
  });

  it("sends no authorization header while there is no session", async () => {
    const api = fakeApi(() => answersWith(aLogin));

    await callApi("/api/auth/login", loginResponseSchema, { method: "POST", body: {} });

    expect(api.sent[0]!.headers.get("authorization")).toBeNull();
  });

  it("sends the access token once there is one, without being handed it", async () => {
    replaceSession({ status: "signed-in", accessToken: "a-signed-token", viewer: aLogin.viewer });
    const api = fakeApi(() => answersWith(aLogin));

    await callApi("/api/auth/me", loginResponseSchema);

    // Read from the one place the token lives rather than passed down through every
    // caller, which is why ADR-0030 puts the token and this client in the same zone.
    expect(api.sent[0]!.headers.get("authorization")).toBe("Bearer a-signed-token");
  });

  it("asks for nothing back from an endpoint that answers 204", async () => {
    fakeApi(() => new Response(null, { status: 204 }));

    await expect(callApiWithoutAnswer("/api/auth/logout", { method: "POST" })).resolves
      .toBeUndefined();
  });
});
