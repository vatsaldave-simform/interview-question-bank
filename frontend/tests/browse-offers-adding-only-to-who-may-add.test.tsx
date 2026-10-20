import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  aBankHolding([aQuestion()]);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

describe("Browse's Add a Question button", () => {
  it("is not offered to a Reader, whom the API would refuse", async () => {
    signInAs(aViewer({ role: "reader" }));
    renderTheWholeClient("/questions");

    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("heading", { level: 1, name: "Browse" })).toBeVisible();
    expect(main.queryByRole("link", { name: "Add a Question" })).not.toBeInTheDocument();
  });

  it.each(["author", "reviewer"] as const)("is offered to a Viewer who is a %s", async (role) => {
    signInAs(aViewer({ role }));
    renderTheWholeClient("/questions");

    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("link", { name: "Add a Question" })).toBeVisible();
  });
});
