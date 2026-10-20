import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { findHome } from "./helpers/home-page";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("leaving Add a Question", () => {
  it("goes to Home on Cancel, and sends nothing", async () => {
    const api = fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/questions/new");
    await userEvent.type(await screen.findByLabelText("Question"), "Half a thought");

    await userEvent.click(screen.getByRole("link", { name: "Cancel" }));

    expect(await findHome()).toBeVisible();
    expect(window.location.pathname).toBe("/");
    expect(api.sent.filter((request) => request.method === "POST")).toHaveLength(0);
  });

  it("offers Send for review beside Cancel, and no link back to the list", async () => {
    fakeBank((asked) => aPageOf([], asked));
    renderTheWholeClient("/questions/new");

    expect(await screen.findByRole("button", { name: "Send for review" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /All Questions/ })).not.toBeInTheDocument();
  });
});
