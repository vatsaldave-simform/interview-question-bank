import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { refusesWith, type FakeApi } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

/** A bank that answers every addition with `refusal`. */
function aBankThatRefuses(refusal: () => Response): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) =>
      request.method === "POST" && asked.pathname === "/api/questions" ? refusal() : undefined,
  );
}

function additionsSent(api: FakeApi): Request[] {
  return api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/questions",
  );
}

async function writeAQuestion(): Promise<void> {
  const question = await screen.findByLabelText("Question");
  await userEvent.type(question, "How would you find a slow query?");
  await userEvent.type(screen.getByLabelText("Answer Notes"), "Look for EXPLAIN ANALYZE.");
}

const addIt = () => userEvent.click(screen.getByRole("button", { name: "Add the Question" }));

describe("adding a Question that is refused", () => {
  it("refuses an empty Question and empty Answer Notes before sending anything", async () => {
    const api = aBankThatRefuses(() => refusesWith(500, "internal_error", "Not expected."));
    renderTheWholeClient("/questions/new");

    // Whitespace alone is empty to the schema, so it is to the form as well.
    await userEvent.type(await screen.findByLabelText("Question"), "   ");
    await addIt();

    expect(await screen.findByText("Write the Question.")).toBeVisible();
    expect(screen.getByText("Write what a good answer looks like.")).toBeVisible();
    expect(screen.getByLabelText("Question")).toHaveFocus();
    expect(screen.getByLabelText("Question")).toHaveAttribute("aria-invalid", "true");
    expect(additionsSent(api)).toEqual([]);
  });

  it("shows a field the API refused against that field, in words a person can act on", async () => {
    // What the API sends for a body its schema refused (`z.treeifyError`).
    aBankThatRefuses(() =>
      refusesWith(400, "invalid_request", "The request is not valid.", {
        errors: [],
        properties: {
          answerNotes: { errors: ["Too small: expected string to have >=1 characters"] },
        },
      }),
    );
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await addIt();

    expect(await screen.findByText("Write what a good answer looks like.")).toBeVisible();
    expect(screen.getByLabelText("Answer Notes")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Question")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Too small/)).not.toBeInTheDocument();
  });

  // Only the database knows which Tags exist, so a Tag removed since the list was read is
  // the one thing the form cannot catch itself (ADR-0024).
  it("names a Tag the API says does not exist, against the Tags", async () => {
    aBankThatRefuses(() =>
      refusesWith(400, "invalid_request", "No such Tag.", { tags: ["technology/node"] }),
    );
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.click(await screen.findByRole("checkbox", { name: "node" }));
    await addIt();

    expect(await screen.findByText("These Tags do not exist: technology/node.")).toBeVisible();
  });

  // The form is there for everyone: whether this Viewer may add is the API's answer, and
  // hiding the form would be the client giving its own (#15).
  it("shows a refusal that names no field in the API's own words", async () => {
    aBankThatRefuses(() => refusesWith(403, "forbidden", "You may not do that."));
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await addIt();

    expect(await screen.findByText("The Question was not added")).toBeVisible();
    expect(screen.getByText("You may not do that.")).toBeVisible();
    // What they wrote is still there, so nothing is lost to the refusal.
    expect(screen.getByLabelText("Question")).toHaveValue("How would you find a slow query?");
  });
});
