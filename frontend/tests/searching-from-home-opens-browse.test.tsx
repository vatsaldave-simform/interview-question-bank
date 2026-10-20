import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("searching from Home", () => {
  it("opens Browse with the keywords in the address", async () => {
    const api = fakeBank((asked) => aPageOf([aQuestion()], asked));
    renderTheWholeClient("/");

    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Search" }),
      " cache miss {Enter}",
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Browse" })).toBeVisible();
    expect(window.location.pathname).toBe("/questions");
    expect(window.location.search).toBe("?keywords=cache+miss");
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.get("keywords")).toBe("cache miss"),
    );
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("cache miss");
  });

  it("opens the whole bank when nothing was typed", async () => {
    fakeBank((asked) => aPageOf([aQuestion()], asked));
    renderTheWholeClient("/");

    await userEvent.click(await screen.findByRole("button", { name: "Search" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Browse" })).toBeVisible();
    expect(window.location.pathname).toBe("/questions");
    expect(window.location.search).toBe("");
  });
});
