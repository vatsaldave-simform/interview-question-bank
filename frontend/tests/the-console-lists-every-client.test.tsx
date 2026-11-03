import type { Client } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
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

/** Answers the Client list as the test says. */
function aBankAnswering(clients: () => Response): void {
  fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) => (asked.pathname === "/api/clients" ? clients() : undefined),
  );
}

function listing(clients: Client[]): () => Response {
  return () => answersWith({ clients });
}

describe("the Clients on the administration console", () => {
  it("lists every Client, in the order the API sent", async () => {
    aBankAnswering(listing([kingsbridge, northwind]));

    renderTheWholeClient("/administration/clients");

    const clients = within(await screen.findByRole("list", { name: "Clients" }));
    const [first, second, ...more] = clients.getAllByRole("listitem");
    expect(first).toHaveTextContent(kingsbridge.name);
    expect(second).toHaveTextContent(northwind.name);
    expect(more).toEqual([]);
  });

  it("says so when no Client has been created", async () => {
    aBankAnswering(listing([]));

    renderTheWholeClient("/administration/clients");

    expect(await screen.findByRole("heading", { name: "No Client yet" })).toBeVisible();
  });

  it("reports the API's refusal of the Client list, with no Try again", async () => {
    aBankAnswering(() => refusesWith(403, "forbidden", "You may not do that."));

    renderTheWholeClient("/administration/clients");

    const clients = within(await screen.findByRole("region", { name: "Clients" }));
    expect(await clients.findByText("The bank refused to show the Clients")).toBeVisible();
    expect(clients.getByText("You may not do that.")).toBeVisible();
    expect(clients.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
