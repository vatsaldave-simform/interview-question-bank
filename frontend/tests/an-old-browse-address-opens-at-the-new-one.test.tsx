import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/App";
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

describe("an address from before Browse moved", () => {
  it("opens Browse at its own address with the same filter", async () => {
    const api = fakeBank((asked) => aPageOf([aQuestion()], asked));

    renderTheWholeClient("/?technology=react&keywords=cache&offset=20");
    await screen.findByText(aQuestion().text);

    expect(window.location.pathname).toBe("/questions");
    expect(window.location.search).toBe("?technology=react&keywords=cache&offset=20");
    const [asked, ...more] = listRequests(api);
    expect(more).toHaveLength(0);
    expect(asked!.searchParams.get("technology")).toBe("react");
    expect(asked!.searchParams.get("keywords")).toBe("cache");
    expect(asked!.searchParams.get("offset")).toBe("20");
  });

  it("opens Home when it names no filter, because Home lives there now", async () => {
    fakeBank((asked) => aPageOf([aQuestion()], asked));

    renderTheWholeClient("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    expect(window.location.pathname).toBe("/");
  });

  it("is replaced, so Back returns to the page before it", async () => {
    fakeBank((asked) => aPageOf([aQuestion()], asked));
    // Two entries, the old address on top, as when a Viewer follows an old link.
    window.history.replaceState({}, "", "/questions/new");
    window.history.pushState({}, "", "/?technology=react");
    render(<App />);
    await screen.findByText(aQuestion().text);
    expect(window.location.pathname).toBe("/questions");

    window.history.back();

    // Had the old address been kept, Back would land on it and be sent forward again.
    await waitFor(() => expect(window.location.pathname).toBe("/questions/new"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Add a Question" }),
    ).toBeVisible();
  });
});
