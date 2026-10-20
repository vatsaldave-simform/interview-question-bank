import { screen, waitFor, within } from "@testing-library/react";
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

describe("the search box on Browse", () => {
  it("has no button, and searches when Enter is pressed", async () => {
    const api = fakeBank((asked) => aPageOf([aQuestion()], asked));
    renderTheWholeClient("/questions");

    const box = await screen.findByRole("search");
    expect(within(box).queryByRole("button")).not.toBeInTheDocument();

    await userEvent.type(within(box).getByRole("searchbox", { name: "Search" }), "closures{Enter}");

    await waitFor(() => expect(window.location.search).toBe("?keywords=closures"));
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.get("keywords")).toBe("closures"),
    );
  });
});
