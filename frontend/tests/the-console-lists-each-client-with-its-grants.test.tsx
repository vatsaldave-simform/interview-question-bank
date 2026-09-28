import type { Client, NamedViewer } from "@iqb/shared";
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

const northwind = aClient();
const kingsbridge = aClient({
  id: "c0000000-0000-4000-8000-000000000002",
  name: "Kingsbridge Health",
});
const reader: NamedViewer = {
  id: "7c3b4a1e-0000-4000-8000-000000000004",
  email: "reader@iqb.test",
};
const author: NamedViewer = {
  id: "7c3b4a1e-0000-4000-8000-000000000005",
  email: "author@iqb.test",
};

function grantsAgainst(client: Client, viewers: NamedViewer[]): Response {
  return answersWith({ grants: viewers.map((viewer) => ({ client, viewer })) });
}

type Answers = {
  clients?: () => Response;
  grants?: (client: Client) => Response | undefined;
  viewers?: () => Response;
};

/** Answers the every-Client list, each Client's Grants and the Viewers as the test says. */
function aBankAnswering({ clients, grants, viewers }: Answers): void {
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => {
      if (asked.pathname === "/api/clients/all") return clients?.();
      if (asked.pathname === "/api/viewers") return viewers?.();
      const client = [northwind, kingsbridge].find(
        ({ id }) => asked.pathname === `/api/clients/${id}/grants`,
      );
      return client === undefined ? undefined : grants?.(client);
    },
  );
}

function clientPage(client: Client): string {
  return `/administration/clients/${client.id}`;
}

describe("the Clients on the administration console", () => {
  it("lists every Client, and each one's page shows the Viewers holding a Grant", async () => {
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: (client) =>
        client === northwind ? grantsAgainst(client, [author, reader]) : grantsAgainst(client, []),
    });

    renderTheWholeClient("/administration/clients");

    const clients = within(await screen.findByRole("list", { name: "Clients" }));
    const names = clients.getAllByRole("link").map((link) => link.textContent);
    expect(names).toEqual([kingsbridge.name, northwind.name]);
    await userEvent.click(clients.getByRole("link", { name: northwind.name }));
    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("author@iqb.test")).toBeVisible();
    expect(northwindGrants.getByText("reader@iqb.test")).toBeVisible();

    await userEvent.click(screen.getByRole("link", { name: "← All Clients" }));
    await userEvent.click(await screen.findByRole("link", { name: kingsbridge.name }));
    const kingsbridgeGrants = within(await screen.findByRole("region", { name: kingsbridge.name }));
    expect(
      await kingsbridgeGrants.findByText("Nobody holds a Grant against this Client."),
    ).toBeVisible();
  });

  it("says so when no Client has been created", async () => {
    aBankAnswering({ clients: () => answersWith({ clients: [] }) });

    renderTheWholeClient("/administration/clients");

    expect(await screen.findByText("No Client has been created.")).toBeVisible();
  });

  it("reports the API's refusal of the Client list, with no Try again", async () => {
    aBankAnswering({ clients: () => refusesWith(403, "forbidden", "You may not do that.") });

    renderTheWholeClient("/administration/clients");

    const clients = within(await screen.findByRole("region", { name: "Clients" }));
    expect(await clients.findByText("The bank refused to show the Clients")).toBeVisible();
    expect(clients.getByText("You may not do that.")).toBeVisible();
    expect(clients.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("reports the API's refusal of a Client's Grants, with no Try again", async () => {
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: () => refusesWith(403, "forbidden", "You may not do that."),
    });

    renderTheWholeClient(clientPage(northwind));

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("The bank refused to show the Grants")).toBeVisible();
    expect(northwindGrants.getByText("You may not do that.")).toBeVisible();
    expect(northwindGrants.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("reports a Client's Grants failing, and asks again", async () => {
    const northwindAnswers = [
      refusesWith(500, "internal_error", "Something went wrong on our side."),
      grantsAgainst(northwind, [reader]),
    ];
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: () => northwindAnswers.shift(),
    });

    renderTheWholeClient(clientPage(northwind));

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("Something went wrong on our side.")).toBeVisible();
    await userEvent.click(northwindGrants.getByRole("button", { name: "Try again" }));
    expect(await northwindGrants.findByText("reader@iqb.test")).toBeVisible();
  });

  it("reports the Viewer list failing where a Grant would be issued", async () => {
    aBankAnswering({
      clients: () => answersWith({ clients: [northwind] }),
      grants: (client) => grantsAgainst(client, [author]),
      viewers: () => refusesWith(500, "internal_error", "Something went wrong on our side."),
    });

    renderTheWholeClient(clientPage(northwind));

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("The Viewers could not be loaded")).toBeVisible();
    expect(northwindGrants.getByText("author@iqb.test")).toBeVisible();
    expect(northwindGrants.queryByLabelText("Viewer")).not.toBeInTheDocument();
  });
});
