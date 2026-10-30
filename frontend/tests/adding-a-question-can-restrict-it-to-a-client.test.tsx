import type { AddQuestionRequest, Client } from "@iqb/shared";
import { screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith, refusesWith, type FakeApi } from "./helpers/fake-api";
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

const acme: Client = { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" };
const globex: Client = { id: "c0000000-0000-4000-8000-000000000002", name: "Globex" };

const added = aQuestion({ id: "a0000000-0000-4000-8000-000000000051" });

/** A bank listing `listed` as its Clients, and which takes any addition, answering
 * `answerTheAddition` when a test gives one. */
function aBankListing(
  listed: Client[],
  answerTheAddition: () => Response = () => answersWith({ question: added }, 201),
): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (asked.pathname === "/api/clients") return answersWith({ clients: listed });
      if (request.method === "POST" && asked.pathname === "/api/questions") {
        return answerTheAddition();
      }
      if (asked.pathname === `/api/questions/${added.id}`) return answersWith({ question: added });
      if (asked.pathname.endsWith("/history")) return answersWith({ events: [] });
      return undefined;
    },
  );
}

/** The Client each addition named, or undefined where it named none. */
async function clientsSent(api: FakeApi): Promise<unknown[]> {
  const additions = api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/questions",
  );
  const bodies = await Promise.all(additions.map((request) => request.json()));
  return bodies.map((body: AddQuestionRequest) => body.clientId);
}

async function writeAQuestion(): Promise<void> {
  await userEvent.type(await screen.findByLabelText("Question"), "How would you migrate it?");
  await userEvent.type(screen.getByLabelText("Answer Notes"), "Move one report at a time.");
  await userEvent.click(screen.getByRole("radio", { name: "Original" }));
}

const addIt = () => userEvent.click(screen.getByRole("button", { name: "Send for review" }));

describe("restricting a new Question to a Client", () => {
  it("offers every Client the API lists, set to no restriction", async () => {
    aBankListing([acme, globex]);
    renderTheWholeClient("/questions/new");

    const choice = await screen.findByRole("combobox", { name: "Restrict to a Client" });
    const offered = within(choice)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(offered).toEqual(["No restriction", "Acme", "Globex"]);
    expect(choice).toHaveDisplayValue("No restriction");
  });

  it("sends the chosen Client's id", async () => {
    const api = aBankListing([acme, globex]);
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Restrict to a Client" }),
      "Globex",
    );
    await addIt();

    await screen.findByRole("heading", { level: 1, name: added.text });
    expect(await clientsSent(api)).toEqual([globex.id]);
  });

  it("names no Client when none is chosen", async () => {
    const api = aBankListing([acme]);
    renderTheWholeClient("/questions/new");

    await screen.findByRole("combobox", { name: "Restrict to a Client" });
    await writeAQuestion();
    await addIt();

    await screen.findByRole("heading", { level: 1, name: added.text });
    expect(await clientsSent(api)).toEqual([undefined]);
  });

  it("offers no choice when there is no Client", async () => {
    aBankListing([]);
    renderTheWholeClient("/questions/new");

    await screen.findByLabelText("Question");
    await waitForElementToBeRemoved(() => screen.queryByText("Loading the Clients…"));
    expect(screen.queryByRole("combobox", { name: "Restrict to a Client" })).toBeNull();
    expect(screen.queryByText(/Client/)).toBeNull();
  });

  it("says when the Clients could not be loaded, and loads them again when asked", async () => {
    let answer = () => refusesWith(500, "internal_error", "Something went wrong.");
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => (asked.pathname === "/api/clients" ? answer() : undefined),
    );
    renderTheWholeClient("/questions/new");

    expect(await screen.findByText("The Clients could not be loaded")).toBeVisible();
    expect(
      screen.getByText("Until they load, the Question cannot be restricted to a Client."),
    ).toBeVisible();

    answer = () => answersWith({ clients: [acme] });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("combobox", { name: "Restrict to a Client" })).toBeVisible();
    expect(screen.queryByText("The Clients could not be loaded")).toBeNull();
  });

  it("shows the API's refusal of a Client in the API's own words", async () => {
    aBankListing([acme], () => refusesWith(400, "invalid_request", "No such Client."));
    renderTheWholeClient("/questions/new");

    await writeAQuestion();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Restrict to a Client" }),
      "Acme",
    );
    await addIt();

    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("The Question was not added");
    expect(refusal).toHaveTextContent("No such Client.");
  });
});
