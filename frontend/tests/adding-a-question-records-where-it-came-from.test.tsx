import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, type FakeApi } from "./helpers/fake-api";
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

const added = aQuestion({ id: "a0000000-0000-4000-8000-000000000042", publicationState: "pending" });

function aBankThatAddsIt(): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (request.method === "POST" && asked.pathname === "/api/questions") {
        return answersWith({ question: added }, 201);
      }
      if (asked.pathname === `/api/questions/${added.id}`) return answersWith({ question: added });
      if (asked.pathname === `/api/questions/${added.id}/history`) {
        return answersWith({ events: [] });
      }
      return undefined;
    },
  );
}

async function additionsSent(api: FakeApi): Promise<Record<string, unknown>[]> {
  const additions = api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/questions",
  );
  return Promise.all(additions.map((request) => request.json()));
}

async function writeAQuestion(): Promise<void> {
  await userEvent.type(await screen.findByLabelText("Question"), "How would you find a slow query?");
  await userEvent.type(screen.getByLabelText("Answer Notes"), "Look for EXPLAIN ANALYZE.");
}

const addIt = () => userEvent.click(screen.getByRole("button", { name: "Add the Question" }));

describe("adding a Question records where it came from", () => {
  it("sends an Adapted Question with the Source the Author named", async () => {
    const api = aBankThatAddsIt();
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.click(screen.getByRole("radio", { name: "Adapted" }));
    await userEvent.type(screen.getByLabelText("Source"), "  Designing Data-Intensive Applications ");
    await addIt();

    await screen.findByRole("heading", { level: 1, name: added.text });
    const [sent] = await additionsSent(api);
    expect(sent).toMatchObject({
      provenance: "adapted",
      source: "Designing Data-Intensive Applications",
    });
  });

  it("refuses a Question with no Provenance chosen, before sending anything", async () => {
    const api = aBankThatAddsIt();
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    expect(screen.getByRole("radio", { name: "Original" })).not.toBeChecked();
    await addIt();

    expect(await screen.findByText("Choose where the Question came from.")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Original" })).toHaveFocus();
    expect(await additionsSent(api)).toEqual([]);
  });

  it("leaves out a Source that is only spaces", async () => {
    const api = aBankThatAddsIt();
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.click(screen.getByRole("radio", { name: "Adapted" }));
    await userEvent.type(screen.getByLabelText("Source"), "   ");
    await addIt();

    await screen.findByRole("heading", { level: 1, name: added.text });
    const [sent] = await additionsSent(api);
    expect(sent).toMatchObject({ provenance: "adapted" });
    expect(sent).not.toHaveProperty("source");
  });

  it("leaves out a Source typed before the Author chose another Provenance", async () => {
    const api = aBankThatAddsIt();
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.click(screen.getByRole("radio", { name: "Adapted" }));
    await userEvent.type(screen.getByLabelText("Source"), "A blog post");
    await userEvent.click(screen.getByRole("radio", { name: "Original" }));
    expect(screen.queryByLabelText("Source")).not.toBeInTheDocument();
    await addIt();

    await screen.findByRole("heading", { level: 1, name: added.text });
    const [sent] = await additionsSent(api);
    expect(sent).toMatchObject({ provenance: "original" });
    expect(sent).not.toHaveProperty("source");
  });
});
