import type { Client } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const kingsbridge = aClient({
  id: "c0000000-0000-4000-8000-000000000002",
  name: "Kingsbridge Health",
});

/** A bank holding `clients`, which answers a create with `created` and adds a Client it
 * made to the list it sends next. Every Client holds no Grants. */
function aBankCreatingClients(clients: Client[], created: () => Response) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/clients/all") return answersWith({ clients });
      if (asked.pathname.endsWith("/grants")) return answersWith({ grants: [] });
      if (asked.pathname !== "/api/clients" || request.method !== "POST") return undefined;
      const answer = created();
      if (answer.ok) clients.push(((await answer.clone().json()) as { client: Client }).client);
      return answer;
    },
  );
}

function creations(api: ReturnType<typeof fakeBank>): Request[] {
  return api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/clients",
  );
}

async function theCreateForm() {
  return within(await screen.findByRole("form", { name: "Create a Client" }));
}

describe("creating a Client from the administration console", () => {
  it("sends the name typed, trimmed, and lists the new Client", async () => {
    const api = aBankCreatingClients([aClient()], () =>
      answersWith({ client: kingsbridge }, 201),
    );
    renderTheWholeClient("/administration");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Name"), "  Kingsbridge Health ");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    expect(await form.findByText("Kingsbridge Health was created.")).toBeVisible();
    const [sent] = creations(api);
    expect(await sent?.json()).toEqual({ name: "Kingsbridge Health" });
    expect(await screen.findByRole("region", { name: "Kingsbridge Health" })).toBeVisible();
    expect(form.getByLabelText("Name")).toHaveValue("");
  });

  it("refuses a name of only spaces on its field, and sends nothing", async () => {
    const api = aBankCreatingClients([], () => answersWith({ client: kingsbridge }, 201));
    renderTheWholeClient("/administration");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Name"), "   ");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    const name = form.getByLabelText("Name");
    expect(name).toHaveAccessibleDescription(
      "Enter the Client's name, in 200 characters or fewer.",
    );
    expect(name).toHaveFocus();
    expect(creations(api)).toHaveLength(0);
  });

  it("reports the API's refusal of a name in use, in its own words", async () => {
    aBankCreatingClients([aClient()], () =>
      refusesWith(409, "conflict", "A Client with that name already exists."),
    );
    renderTheWholeClient("/administration");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Name"), "Northwind Trading");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    const refusal = within(await form.findByRole("alert"));
    expect(refusal.getByText("The Client was not created.")).toBeVisible();
    expect(refusal.getByText("A Client with that name already exists.")).toBeVisible();
    expect(form.queryByRole("status")).not.toBeInTheDocument();
    expect(form.getByLabelText("Name")).toHaveValue("Northwind Trading");
  });

  it("reports a field the API refused on that field", async () => {
    aBankCreatingClients([], () =>
      refusesWith(400, "invalid_request", "The request body is not valid.", {
        errors: [],
        properties: { name: { errors: ["Too big"] } },
      }),
    );
    renderTheWholeClient("/administration");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Name"), "Kingsbridge Health");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    expect(
      await form.findByText("Enter the Client's name, in 200 characters or fewer."),
    ).toBeVisible();
    expect(form.queryByText("The Client was not created.")).not.toBeInTheDocument();
  });
});
