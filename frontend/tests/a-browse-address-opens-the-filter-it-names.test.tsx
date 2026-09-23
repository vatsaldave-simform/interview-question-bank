import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
import { aPageOf, fakeBank, listRequests, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("opening a browse address someone shared", () => {
  it("asks the API for exactly the filter the address names", async () => {
    const api = fakeBank((asked) => aPageOf([aQuestion()], asked));

    renderTheWholeClient(
      "/?technology=react&technology=node&seniority=senior&keywords=cache&offset=20",
    );
    await screen.findByText(aQuestion().text);

    const [asked, ...more] = listRequests(api);
    expect(more).toHaveLength(0);
    expect(asked!.searchParams.getAll("technology")).toEqual(["react", "node"]);
    expect(asked!.searchParams.getAll("seniority")).toEqual(["senior"]);
    expect(asked!.searchParams.get("keywords")).toBe("cache");
    expect(asked!.searchParams.get("offset")).toBe("20");
  });

  it("leaves the address as it was written", async () => {
    fakeBank((asked) => aPageOf([aQuestion()], asked));

    renderTheWholeClient("/?technology=react&technology=node");
    await screen.findByText(aQuestion().text);

    expect(window.location.search).toBe("?technology=react&technology=node");
  });
});
