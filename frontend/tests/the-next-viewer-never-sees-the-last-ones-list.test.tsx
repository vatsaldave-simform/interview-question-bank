import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aSignedInAuthor, aViewer, answersWith, fakeApi } from "./helpers/fake-api";
import { aPageOf, signInAs } from "./helpers/fake-bank";
import { findHome } from "./helpers/home-page";
import { signInOnScreen } from "./helpers/login-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const anotherAuthor = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000004",
  email: "another-author@iqb.test",
});

describe("two Viewers taking turns in one tab", () => {
  it("never shows the second one a list the first one was given", async () => {
    let secondSignedIn = false;
    let answerTheSecond: (() => void) | undefined;
    fakeApi((request) => {
      const asked = new URL(request.url);
      if (asked.pathname === "/api/auth/logout") return new Response(null, { status: 204 });
      if (asked.pathname === "/api/auth/login") {
        secondSignedIn = true;
        return answersWith({ ...aSignedInAuthor, viewer: anotherAuthor });
      }
      if (!secondSignedIn) {
        return aPageOf([aQuestion({ text: "Only the first Viewer may see this" })], asked);
      }
      // Held back, so the test can look at the screen before the second Viewer's list answers.
      return new Promise<Response>((answer) => {
        answerTheSecond = () =>
          answer(aPageOf([aQuestion({ text: "The second Viewer's own" })], asked));
      });
    });
    signInAs(aSignedInAuthor.viewer);
    renderTheWholeClient("/questions");
    await screen.findByText("Only the first Viewer may see this");

    await userEvent.click(screen.getByRole("button", { name: "author@iqb.test" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));
    await screen.findByRole("button", { name: "Sign in" });
    await signInOnScreen(anotherAuthor.email, "author-password");
    await findHome();
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Main menu" })).getByRole("link", {
        name: "Browse",
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Loading Questions…");
    expect(screen.queryByText("Only the first Viewer may see this")).not.toBeInTheDocument();
    answerTheSecond!();
    expect(await screen.findByText("The second Viewer's own")).toBeVisible();
  });
});
