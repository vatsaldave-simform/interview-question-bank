import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { anAdministrator, answersWith, aRoleRequest } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const panels = [
  "Recently added",
  "Waiting for your review",
  "Open Role Requests",
  "Your Pending and Rejected Questions",
  "Your Role Request",
];

describe("Home's panels", () => {
  it("come in one order: the newest Questions, then the work that waits", async () => {
    // A Reviewer and an Administrator with a Role Request of their own, so every panel shows.
    signInAs(anAdministrator);
    const { id, email } = anAdministrator;
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) =>
        asked.pathname === "/api/role-requests/mine"
          ? answersWith({ roleRequests: [aRoleRequest({ viewer: { id, email } })] })
          : undefined,
    );
    renderTheWholeClient("/");

    await screen.findByRole("region", { name: "Your Role Request" });
    const titles = within(screen.getByRole("main")).getAllByRole("heading", { level: 2 });
    expect(titles.map((title) => title.textContent)).toEqual(panels);
  });
});
