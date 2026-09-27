import type { Client, NamedViewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, aViewer, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
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
const reader = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000004",
  email: "reader@iqb.test",
  role: "reader",
});
const author = aViewer({ id: "7c3b4a1e-0000-4000-8000-000000000005" });
// In email order, as the API sends them.
const viewers = [author, reader, anAdministrator];

function named({ id, email }: NamedViewer): NamedViewer {
  return { id, email };
}

/** A bank where `holding` says who holds a Grant against each Client. It issues and
 * revokes them, unless `refuse` answers first. */
function aBankGranting(
  holding: Map<Client, NamedViewer[]>,
  refuse: (request: Request) => Response | undefined = () => undefined,
) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/viewers") return answersWith({ viewers });
      if (asked.pathname === "/api/clients/all") {
        return answersWith({ clients: [...holding.keys()] });
      }
      const path = /^\/api\/clients\/([^/]+)\/grants(?:\/([^/]+))?$/.exec(asked.pathname);
      const client = [...holding.keys()].find(({ id }) => id === path?.[1]);
      if (path === null || client === undefined) return undefined;
      const holders = holding.get(client)!;
      if (request.method === "GET") {
        return answersWith({ grants: holders.map((viewer) => ({ client, viewer })) });
      }
      const refused = refuse(request);
      if (refused !== undefined) return refused;
      if (request.method === "POST") {
        const { viewerId } = (await request.json()) as { viewerId: string };
        const viewer = named(viewers.find(({ id }) => id === viewerId)!);
        holders.push(viewer);
        return answersWith({ grant: { client, viewer } }, 201);
      }
      holding.set(client, holders.filter(({ id }) => id !== path[2]));
      return new Response(null, { status: 204 });
    },
  );
}

function grantActsSent(api: ReturnType<typeof fakeBank>): string[] {
  return api.sent
    .filter((request) => request.method !== "GET")
    .map((request) => `${request.method} ${new URL(request.url).pathname}`)
    .filter((sent) => sent.includes("/grants"));
}

async function sectionFor(client: Client) {
  return within(await screen.findByRole("region", { name: client.name }));
}

function optionsIn(picker: HTMLElement): string[] {
  return within(picker)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("issuing and revoking a Grant from the administration console", () => {
  it("issues a Grant to a Viewer picked from those who do not hold one", async () => {
    const api = aBankGranting(
      new Map([
        [northwind, [named(author)]],
        [kingsbridge, []],
      ]),
    );
    renderTheWholeClient("/administration");

    const section = await sectionFor(northwind);
    const picker = await section.findByLabelText("Viewer");
    expect(optionsIn(picker)).toEqual(["Choose a Viewer", "reader@iqb.test", "reviewer@iqb.test"]);
    await userEvent.selectOptions(picker, "reader@iqb.test");
    await userEvent.click(section.getByRole("button", { name: "Issue a Grant" }));

    const holders = within(await section.findByRole("list", { name: "Viewers holding a Grant" }));
    expect(await holders.findByText("reader@iqb.test")).toBeVisible();
    expect(optionsIn(section.getByLabelText("Viewer"))).toEqual([
      "Choose a Viewer",
      "reviewer@iqb.test",
    ]);
    expect(grantActsSent(api)).toEqual([`POST /api/clients/${northwind.id}/grants`]);
    const [sent] = api.sent.filter((request) => request.method === "POST");
    expect(await sent?.json()).toEqual({ viewerId: reader.id });
  });

  it("revokes a Viewer's Grant, and offers them for one again", async () => {
    const api = aBankGranting(new Map([[northwind, [named(author)]]]));
    renderTheWholeClient("/administration");

    const section = await sectionFor(northwind);
    const holders = within(await section.findByRole("list", { name: "Viewers holding a Grant" }));
    const holder = within(holders.getByText("author@iqb.test").closest("li")!);
    await userEvent.click(holder.getByRole("button", { name: "Revoke" }));

    expect(await section.findByText("Nobody holds a Grant against this Client.")).toBeVisible();
    expect(optionsIn(section.getByLabelText("Viewer"))).toContain("author@iqb.test");
    expect(grantActsSent(api)).toEqual([`DELETE /api/clients/${northwind.id}/grants/${author.id}`]);
  });

  it.each([
    {
      act: "issuing",
      message: "That Viewer already holds a Grant for that Client.",
      refusal: () =>
        refusesWith(409, "conflict", "That Viewer already holds a Grant for that Client."),
      press: async (section: ReturnType<typeof within>) => {
        await userEvent.selectOptions(section.getByLabelText("Viewer"), "reader@iqb.test");
        await userEvent.click(section.getByRole("button", { name: "Issue a Grant" }));
      },
    },
    {
      act: "revoking",
      refusal: () => refusesWith(404, "not_found", "Not found."),
      message: "Not found.",
      press: async (section: ReturnType<typeof within>) => {
        await userEvent.click(section.getByRole("button", { name: "Revoke" }));
      },
    },
  ])("reports the API's refusal of $act on that Client alone", async ({ refusal, message, press }) => {
    aBankGranting(
      new Map([
        [northwind, [named(author)]],
        [kingsbridge, []],
      ]),
      refusal,
    );
    renderTheWholeClient("/administration");

    const section = await sectionFor(northwind);
    await section.findByLabelText("Viewer");
    await press(section);

    const alert = within(await section.findByRole("alert"));
    expect(alert.getByText("That was not done.")).toBeVisible();
    expect(alert.getByText(message)).toBeVisible();
    expect(section.getByText("author@iqb.test")).toBeVisible();
    expect((await sectionFor(kingsbridge)).queryByRole("alert")).not.toBeInTheDocument();
  });
});
