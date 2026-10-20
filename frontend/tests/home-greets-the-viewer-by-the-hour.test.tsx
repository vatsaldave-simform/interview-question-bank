import type { Viewer } from "@iqb/shared";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator, aViewer } from "./helpers/fake-api";
import { aBankHolding, signInAs } from "./helpers/fake-bank";
import { findHome } from "./helpers/home-page";
import { itIsNow } from "./helpers/the-clock";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  aBankHolding([]);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const todayAt = (hours: number) => new Date(2026, 9, 20, hours, 0);

describe("Home's header", () => {
  it.each([
    [9, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("at %i:00 says %s", async (hours, greeting) => {
    itIsNow(todayAt(hours));
    signInAs();
    renderTheWholeClient("/");

    expect(await findHome()).toHaveAccessibleName(greeting);
  });

  it("shows today's date above the greeting", async () => {
    itIsNow(todayAt(9));
    signInAs();
    renderTheWholeClient("/");

    await findHome();
    expect(screen.getByText("Tuesday, October 20")).toBeVisible();
  });

  it.each<[string, Viewer, string]>([
    ["a Reader", aViewer({ role: "reader" }), "Signed in as author@iqb.test, a Reader."],
    ["an Author", aViewer({ role: "author" }), "Signed in as author@iqb.test, an Author."],
    ["a Reviewer", aViewer({ role: "reviewer" }), "Signed in as author@iqb.test, a Reviewer."],
    [
      "an Administrator",
      anAdministrator,
      "Signed in as reviewer@iqb.test, a Reviewer and an Administrator.",
    ],
    [
      "an Administrator who is also a Reader",
      aViewer({ role: "reader", isAdministrator: true }),
      "Signed in as author@iqb.test, a Reader and an Administrator.",
    ],
  ])("says who is signed in, for %s", async (_who, viewer, says) => {
    signInAs(viewer);
    renderTheWholeClient("/");

    await findHome();
    expect(screen.getByText(says)).toBeVisible();
  });
});
