import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith } from "./helpers/fake-api";
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

describe("a list the API did not give", () => {
  it("reports what the API refused, in its own words", async () => {
    fakeBank(() => refusesWith(400, "invalid_request", "There is no Tag called cobol."));

    renderTheWholeClient("/?technology=cobol");

    expect(await screen.findByRole("alert")).toHaveTextContent("There is no Tag called cobol.");
  });

  it("says the answer made no sense, rather than showing the parser's complaint", async () => {
    fakeBank(() => answersWith({ questions: "not a list" }));

    renderTheWholeClient("/");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The bank answered, but not in a way this client understands.",
    );
  });

  it("asks again when the Viewer says to try again", async () => {
    let answered = 0;
    const api = fakeBank((asked) =>
      answered++ === 0
        ? refusesWith(500, "internal_error", "Something went wrong.")
        : aPageOf([aQuestion()], asked),
    );
    renderTheWholeClient("/");
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(aQuestion().text)).toBeVisible();
    expect(listRequests(api)).toHaveLength(2);
  });
});
