import type { Client, NamedViewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, aViewer, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";
import { theToastSaying, toastsShown } from "./helpers/toasts";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(anAdministrator);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const northwind = aClient();
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

async function confirmTheRevoke(): Promise<void> {
  const confirmation = within(await screen.findByRole("alertdialog"));
  await userEvent.click(confirmation.getByRole("button", { name: "Revoke" }));
}

function optionsIn(picker: HTMLElement): string[] {
  return within(picker)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

/** Presses the page's "Issue a Permission Grant", which opens the form in a dialog. */
async function theGrantDialog(section: ReturnType<typeof within>) {
  await userEvent.click(await section.findByRole("button", { name: "Issue a Permission Grant" }));
  return within(await screen.findByRole("dialog", { name: "Issue a Permission Grant" }));
}

async function theGrantsTable(section: ReturnType<typeof within>) {
  return within(await section.findByRole("table", { name: "Permission Grants" }));
}

describe("issuing a Permission Grant from the administration console", () => {
  it("issues a Grant from a dialog, to a Viewer picked from those who do not hold one", async () => {
    const api = aBankGranting(new Map([[northwind, [named(author)]]]));
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const section = await sectionFor(northwind);
    const dialog = await theGrantDialog(section);
    const picker = await dialog.findByLabelText("Viewer");
    expect(optionsIn(picker)).toEqual(["Choose a Viewer", "reader@iqb.test", "reviewer@iqb.test"]);
    await userEvent.selectOptions(picker, "reader@iqb.test");
    await userEvent.click(dialog.getByRole("button", { name: "Issue" }));

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const grants = await theGrantsTable(section);
    expect(await grants.findByRole("cell", { name: "reader@iqb.test" })).toBeVisible();
    expect(
      await theToastSaying("reader@iqb.test now holds a Grant against this Client."),
    ).toBeVisible();
    const again = await theGrantDialog(section);
    expect(optionsIn(again.getByLabelText("Viewer"))).toEqual([
      "Choose a Viewer",
      "reviewer@iqb.test",
    ]);
    expect(grantActsSent(api)).toEqual([`POST /api/clients/${northwind.id}/grants`]);
    const [sent] = api.sent.filter((request) => request.method === "POST");
    expect(await sent?.json()).toEqual({ viewerId: reader.id });
  });

  it("sends nothing until a Viewer is picked, and nothing on Cancel", async () => {
    const api = aBankGranting(new Map([[northwind, [named(author)]]]));
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const dialog = await theGrantDialog(await sectionFor(northwind));
    await dialog.findByLabelText("Viewer");
    expect(dialog.getByRole("button", { name: "Issue" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(grantActsSent(api)).toEqual([]);
  });

  it("is offered by an empty list in place of the page's own button", async () => {
    aBankGranting(new Map([[northwind, []]]));
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const empty = within(
      await screen.findByRole("region", { name: "Nobody can see this Client's Questions yet" }),
    );
    expect(
      await screen.findAllByRole("button", { name: "Issue a Permission Grant" }),
    ).toHaveLength(1);
    await userEvent.click(empty.getByRole("button", { name: "Issue a Permission Grant" }));
    expect(await screen.findByRole("dialog", { name: "Issue a Permission Grant" })).toBeVisible();
  });

  it("reports the API's refusal in the dialog, which stays open", async () => {
    aBankGranting(new Map([[northwind, [named(author)]]]), () =>
      refusesWith(409, "conflict", "That Viewer already holds a Grant for that Client."),
    );
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const dialog = await theGrantDialog(await sectionFor(northwind));
    await userEvent.selectOptions(await dialog.findByLabelText("Viewer"), "reader@iqb.test");
    await userEvent.click(dialog.getByRole("button", { name: "Issue" }));

    const alert = within(await dialog.findByRole("alert"));
    expect(alert.getByText("The Permission Grant was not issued.")).toBeVisible();
    expect(alert.getByText("That Viewer already holds a Grant for that Client.")).toBeVisible();
    expect(toastsShown()).toHaveLength(0);
  });
});

describe("revoking a Permission Grant from the administration console", () => {
  it("revokes a Viewer's Grant, and offers them for one again", async () => {
    const api = aBankGranting(new Map([[northwind, [named(author)]]]));
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const section = await sectionFor(northwind);
    const grants = await theGrantsTable(section);
    const holder = within(grants.getByRole("cell", { name: "author@iqb.test" }).closest("tr")!);
    await userEvent.click(holder.getByRole("button", { name: "Revoke" }));
    await confirmTheRevoke();

    expect(
      await section.findByRole("heading", { name: "Nobody can see this Client's Questions yet" }),
    ).toBeVisible();
    expect(await theToastSaying("author@iqb.test's Grant was revoked.")).toBeVisible();
    const dialog = await theGrantDialog(section);
    expect(optionsIn(await dialog.findByLabelText("Viewer"))).toContain("author@iqb.test");
    expect(grantActsSent(api)).toEqual([`DELETE /api/clients/${northwind.id}/grants/${author.id}`]);
  });

  it("asks before it revokes, and sends nothing on Cancel", async () => {
    const api = aBankGranting(new Map([[northwind, [named(author)]]]));
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const section = await sectionFor(northwind);
    await userEvent.click(await section.findByRole("button", { name: "Revoke" }));
    const confirmation = within(await screen.findByRole("alertdialog"));
    expect(confirmation.getByText(/author@iqb\.test can no longer see/)).toBeVisible();
    await userEvent.click(confirmation.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect((await sectionFor(northwind)).getByText("author@iqb.test")).toBeVisible();
    expect(grantActsSent(api)).toEqual([]);
  });

  it("reports the API's refusal, and keeps the Grants as they were", async () => {
    aBankGranting(new Map([[northwind, [named(author)]]]), () =>
      refusesWith(404, "not_found", "Not found."),
    );
    renderTheWholeClient(`/administration/clients/${northwind.id}`);

    const section = await sectionFor(northwind);
    await userEvent.click(await section.findByRole("button", { name: "Revoke" }));
    await confirmTheRevoke();

    const alert = within(await section.findByRole("alert"));
    expect(alert.getByText("The Permission Grant was not revoked.")).toBeVisible();
    expect(alert.getByText("Not found.")).toBeVisible();
    expect(section.getByText("author@iqb.test")).toBeVisible();
    expect(toastsShown()).toHaveLength(0);
  });
});
