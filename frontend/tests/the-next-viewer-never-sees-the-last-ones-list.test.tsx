import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, aSignedInAuthor, answersWith, fakeApi } from "./helpers/fake-api";
import { aPageOf, signInAs } from "./helpers/fake-bank";
import { signInOnScreen } from "./helpers/login-screen";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const aReader = { ...aSignedInAuthor.viewer, email: "reader@iqb.test", role: "reader" as const };

describe("two Viewers taking turns in one tab", () => {
  it("never shows the second one a list the first one was given", async () => {
    let readerSignedIn = false;
    let answerTheReader: (() => void) | undefined;
    fakeApi((request) => {
      const asked = new URL(request.url);
      if (asked.pathname === "/api/auth/logout") return new Response(null, { status: 204 });
      if (asked.pathname === "/api/auth/login") {
        readerSignedIn = true;
        return answersWith({ ...aSignedInAuthor, viewer: aReader });
      }
      if (!readerSignedIn) {
        return aPageOf([aQuestion({ text: "Only the first Viewer may see this" })], asked);
      }
      // Held back, so the test can look at the screen before the reader's list answers.
      return new Promise<Response>((answer) => {
        answerTheReader = () => answer(aPageOf([aQuestion({ text: "The reader's own" })], asked));
      });
    });
    signInAs(aSignedInAuthor.viewer);
    renderTheWholeClient("/");
    await screen.findByText("Only the first Viewer may see this");

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("button", { name: "Sign in" });
    await signInOnScreen(aReader.email, "reader-password");

    expect(await screen.findByText("Loading Questions…")).toBeVisible();
    expect(screen.queryByText("Only the first Viewer may see this")).not.toBeInTheDocument();
    answerTheReader!();
    expect(await screen.findByText("The reader's own")).toBeVisible();
  });
});
