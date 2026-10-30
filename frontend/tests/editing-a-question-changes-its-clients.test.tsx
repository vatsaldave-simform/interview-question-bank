import type { Client, Question } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
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

const acme: Client = { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" };
const globex: Client = { id: "c0000000-0000-4000-8000-000000000002", name: "Globex" };

const original = aQuestion({ id: "a0000000-0000-4000-8000-000000000008", clients: [acme] });

/** Lists both Clients, and answers an edit with the Question as the API would leave it. */
function aBankWithTwoClients(): FakeApi {
  let current: Question = original;
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/clients") return answersWith({ clients: [acme, globex] });
      if (asked.pathname === `/api/questions/${original.id}/history`) {
        return answersWith({ events: [] });
      }
      if (asked.pathname !== `/api/questions/${original.id}`) return undefined;
      if (request.method === "PATCH") {
        const { clientIds, ...edit } = (await request.clone().json()) as {
          clientIds?: string[];
        } & Partial<Question>;
        current = {
          ...current,
          ...edit,
          ...(clientIds === undefined
            ? {}
            : { clients: [acme, globex].filter(({ id }) => clientIds.includes(id)) }),
        };
      }
      return answersWith({ question: current });
    },
  );
}

async function editsSent(api: FakeApi): Promise<unknown[]> {
  const edits = api.sent.filter((request) => request.method === "PATCH");
  return Promise.all(edits.map((request) => request.json()));
}

async function openTheEditForm(): Promise<void> {
  renderTheWholeClient(`/questions/${original.id}`);
  await userEvent.click(await screen.findByRole("link", { name: "Edit" }));
}

const clientBox = (name: string) => screen.findByRole("checkbox", { name });
const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

describe("changing a Question's Clients by editing it", () => {
  it("opens with the Clients the Question already names chosen", async () => {
    aBankWithTwoClients();
    await openTheEditForm();

    expect(await clientBox("Acme")).toBeChecked();
    expect(await clientBox("Globex")).not.toBeChecked();
  });

  it("sends the whole new list when a Client is added, and shows it", async () => {
    const api = aBankWithTwoClients();
    await openTheEditForm();

    await userEvent.click(await clientBox("Globex"));
    await save();

    const heading = await screen.findByRole("heading", { level: 1, name: original.text });
    expect(heading).toBeVisible();
    expect(await editsSent(api)).toEqual([{ clientIds: [acme.id, globex.id] }]);
    const chips = within(screen.getByRole("list", { name: "Clients" })).getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Acme", "Globex"]);
  });

  it("sends an empty list when every Client is removed", async () => {
    const api = aBankWithTwoClients();
    await openTheEditForm();

    await userEvent.click(await clientBox("Acme"));
    await save();

    await screen.findByRole("heading", { level: 1, name: original.text });
    expect(await editsSent(api)).toEqual([{ clientIds: [] }]);
  });

  it("sends nothing when a Client is removed and chosen again", async () => {
    const api = aBankWithTwoClients();
    await openTheEditForm();

    await userEvent.click(await clientBox("Acme"));
    await userEvent.click(await clientBox("Acme"));
    await save();

    expect(
      await screen.findByText("Nothing has changed. Change something before saving."),
    ).toBeVisible();
    expect(await editsSent(api)).toEqual([]);
  });

  it("leaves the Clients out of an edit that changes only the text", async () => {
    const api = aBankWithTwoClients();
    await openTheEditForm();

    await clientBox("Acme");
    const questionBox = await screen.findByLabelText("Question");
    await userEvent.clear(questionBox);
    await userEvent.type(questionBox, "What does `satisfies` check?");
    await save();

    await screen.findByRole("heading", { level: 1, name: "What does `satisfies` check?" });
    expect(await editsSent(api)).toEqual([{ text: "What does `satisfies` check?" }]);
  });
});
