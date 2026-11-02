import type { Client } from "@iqb/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aQuestion, answersWith } from "./helpers/fake-api";
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

const northwind: Client = { id: "6aa112c9-56fe-4d24-80b8-3873879a99a2", name: "Northwind" };
const kingsbridge: Client = { id: "2fa907f0-b951-4f27-bdff-255a497cb779", name: "Kingsbridge" };

function aBankWithClients(clients: Client[] = [northwind, kingsbridge]) {
  return fakeBank(
    (asked) => aPageOf([aQuestion()], asked),
    (_request, asked) =>
      asked.pathname === "/api/clients" ? answersWith({ clients }) : undefined,
  );
}

function clientPill(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /^Client ·/ });
}

async function pickClient(name: string): Promise<void> {
  await userEvent.click(await clientPill());
  const menu = within(await screen.findByRole("menu"));
  await userEvent.click(menu.getByRole("menuitemcheckbox", { name }));
  await userEvent.keyboard("{Escape}");
}

describe("filtering the bank by Client", () => {
  it("offers a Client pill holding the Clients the API listed, by name", async () => {
    aBankWithClients();
    renderTheWholeClient("/questions");

    expect(await clientPill()).toHaveAccessibleName("Client · Any");
    await userEvent.click(await clientPill());
    const menu = within(await screen.findByRole("menu"));
    expect(menu.getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      "Northwind",
      "Kingsbridge",
    ]);
  });

  it("sends the Clients picked by id, and keeps them in the address", async () => {
    const api = aBankWithClients();
    renderTheWholeClient("/questions");

    await pickClient("Northwind");
    await pickClient("Kingsbridge");

    const both = `?client=${northwind.id}&client=${kingsbridge.id}`;
    await waitFor(() => expect(window.location.search).toBe(both));
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.getAll("client")).toEqual([
        northwind.id,
        kingsbridge.id,
      ]),
    );
    expect(await clientPill()).toHaveAccessibleName("Client · 2 chosen");
  });

  it("names the Client the address picks, and sends it with the Tags and search", async () => {
    const api = aBankWithClients();
    renderTheWholeClient(`/questions?technology=react&client=${northwind.id}&keywords=cache`);

    expect(await clientPill()).toHaveAccessibleName("Client · Northwind");
    await waitFor(() => {
      const asked = listRequests(api).at(-1)!;
      expect(asked.searchParams.getAll("client")).toEqual([northwind.id]);
      expect(asked.searchParams.getAll("technology")).toEqual(["react"]);
      expect(asked.searchParams.get("keywords")).toBe("cache");
    });
  });

  it("stops sending a Client once it is unticked", async () => {
    const api = aBankWithClients();
    renderTheWholeClient(`/questions?client=${northwind.id}&client=${kingsbridge.id}`);

    await pickClient("Northwind");

    await waitFor(() => expect(window.location.search).toBe(`?client=${kingsbridge.id}`));
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.getAll("client")).toEqual([kingsbridge.id]),
    );
  });

  it("clears the Clients with the other filters", async () => {
    aBankWithClients();
    renderTheWholeClient(`/questions?client=${northwind.id}&seniority=senior`);

    await userEvent.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(await clientPill()).toHaveAccessibleName("Client · Any");
  });

  it("offers no Client pill when there are no Clients to pick", async () => {
    aBankWithClients([]);
    renderTheWholeClient("/questions");
    await screen.findByText(aQuestion().text);

    expect(screen.queryByRole("button", { name: /^Client ·/ })).not.toBeInTheDocument();
  });

  it("refuses an address naming a Client by something that is not an id", async () => {
    const api = aBankWithClients();
    renderTheWholeClient("/questions?client=northwind");

    expect(await screen.findByText("This address cannot be shown")).toBeVisible();
    expect(listRequests(api)).toHaveLength(0);
  });
});
