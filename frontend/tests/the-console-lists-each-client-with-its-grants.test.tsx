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
};

/** Answers the every-Client list and each Client's Grants as the test says. */
function aBankAnswering({ clients, grants }: Answers): void {
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => {
      if (asked.pathname === "/api/clients/all") return clients?.();
      const client = [northwind, kingsbridge].find(
        ({ id }) => asked.pathname === `/api/clients/${id}/grants`,
      );
      return client === undefined ? undefined : grants?.(client);
    },
  );
}

function sectionFor(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("the Clients on the administration console", () => {
  it("lists every Client with the Viewers holding a Grant against it", async () => {
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: (client) =>
        client === northwind ? grantsAgainst(client, [author, reader]) : grantsAgainst(client, []),
    });

    renderTheWholeClient("/administration");

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("author@iqb.test")).toBeVisible();
    expect(northwindGrants.getByText("reader@iqb.test")).toBeVisible();
    const kingsbridgeGrants = within(sectionFor(kingsbridge.name));
    expect(
      await kingsbridgeGrants.findByText("Nobody holds a Grant against this Client."),
    ).toBeVisible();
  });

  it("says so when no Client has been created", async () => {
    aBankAnswering({ clients: () => answersWith({ clients: [] }) });

    renderTheWholeClient("/administration");

    expect(await screen.findByText("No Client has been created.")).toBeVisible();
  });

  it("reports the API's refusal of the Client list, with no Try again", async () => {
    aBankAnswering({ clients: () => refusesWith(403, "forbidden", "You may not do that.") });

    renderTheWholeClient("/administration");

    const clients = within(await screen.findByRole("region", { name: "Clients" }));
    expect(await clients.findByText("The bank refused to show the Clients")).toBeVisible();
    expect(clients.getByText("You may not do that.")).toBeVisible();
    expect(clients.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("reports a refusal of one Client's Grants on that Client alone", async () => {
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: (client) =>
        client === northwind
          ? refusesWith(403, "forbidden", "You may not do that.")
          : grantsAgainst(client, [author]),
    });

    renderTheWholeClient("/administration");

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("The bank refused to show the Grants")).toBeVisible();
    expect(northwindGrants.getByText("You may not do that.")).toBeVisible();
    expect(northwindGrants.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(await within(sectionFor(kingsbridge.name)).findByText("author@iqb.test")).toBeVisible();
  });

  it("reports one Client's Grants failing on that Client alone, and asks again", async () => {
    const northwindAnswers = [
      refusesWith(500, "internal_error", "Something went wrong on our side."),
      grantsAgainst(northwind, [reader]),
    ];
    aBankAnswering({
      clients: () => answersWith({ clients: [kingsbridge, northwind] }),
      grants: (client) =>
        client === northwind ? northwindAnswers.shift() : grantsAgainst(client, [author]),
    });

    renderTheWholeClient("/administration");

    const northwindGrants = within(await screen.findByRole("region", { name: northwind.name }));
    expect(await northwindGrants.findByText("Something went wrong on our side.")).toBeVisible();
    expect(await within(sectionFor(kingsbridge.name)).findByText("author@iqb.test")).toBeVisible();
    await userEvent.click(northwindGrants.getByRole("button", { name: "Try again" }));
    expect(await northwindGrants.findByText("reader@iqb.test")).toBeVisible();
  });
});
