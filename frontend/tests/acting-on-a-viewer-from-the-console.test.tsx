import type { Viewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aViewer, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
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

const reader = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000004",
  email: "reader@iqb.test",
  role: "reader",
});

/** How the bank changes a Viewer for each act, keyed by method and the path's last part. */
const acts: Record<string, (viewer: Viewer, body: unknown) => Viewer> = {
  "PATCH role": (viewer, body) => ({ ...viewer, ...(body as Pick<Viewer, "role">) }),
  "POST administrator": (viewer) => ({ ...viewer, isAdministrator: true }),
  "DELETE administrator": (viewer) => ({ ...viewer, isAdministrator: false }),
  "POST deactivation": (viewer) => ({ ...viewer, isDeactivated: true }),
  "DELETE deactivation": (viewer) => ({ ...viewer, isDeactivated: false }),
};

/** A bank holding `viewers` that carries out each act on one, unless `refuse` answers it
 * first. */
function aBankHolding(
  viewers: Viewer[],
  refuse: (request: Request) => Response | undefined = () => undefined,
) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/viewers") return answersWith({ viewers });
      const named = /^\/api\/viewers\/([^/]+)\/([a-z]+)$/.exec(asked.pathname);
      if (named === null) return undefined;
      const refused = refuse(request);
      if (refused !== undefined) return refused;
      const [, id, part] = named;
      const act = acts[`${request.method} ${part}`];
      const index = viewers.findIndex((viewer) => viewer.id === id);
      if (act === undefined || index === -1) return refusesWith(404, "not_found", "Not found.");
      const body: unknown = request.method === "PATCH" ? await request.json() : undefined;
      const changed = act(viewers[index]!, body);
      viewers[index] = changed;
      return answersWith({ viewer: changed });
    },
  );
}

function actsSent(api: ReturnType<typeof fakeBank>): string[] {
  return api.sent
    .map((request) => `${request.method} ${new URL(request.url).pathname}`)
    .filter((sent) => !sent.startsWith("GET") && sent.includes(" /api/viewers/"));
}

async function rowFor(email: string) {
  const viewers = await screen.findByRole("table", { name: "Viewers" });
  const row = (await within(viewers).findAllByRole("row")).find(
    (candidate) => within(candidate).queryByText(email) !== null,
  );
  if (row === undefined) throw new Error(`No row for ${email}.`);
  return within(row);
}

describe("acting on one Viewer from the administration console", () => {
  it("changes a Viewer's role to the one picked", async () => {
    const api = aBankHolding([anAdministrator, reader]);
    renderTheWholeClient("/administration/viewers");

    const row = await rowFor("reader@iqb.test");
    await userEvent.selectOptions(row.getByLabelText("Role for reader@iqb.test"), "Author");
    await userEvent.click(row.getByRole("button", { name: "Change role" }));

    expect(await row.findByRole("cell", { name: "Author" })).toBeVisible();
    expect(actsSent(api)).toEqual([`PATCH /api/viewers/${reader.id}/role`]);
    const [sent] = api.sent.filter((request) => request.method === "PATCH");
    expect(await sent?.json()).toEqual({ role: "author" });
  });

  it("appoints a Viewer as an Administrator, and withdraws the authority again", async () => {
    const api = aBankHolding([anAdministrator, reader]);
    renderTheWholeClient("/administration/viewers");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Appoint as Administrator" }));
    expect(await row.findByRole("cell", { name: "Yes" })).toBeVisible();

    await userEvent.click(row.getByRole("button", { name: "Withdraw Administrator" }));
    expect(await row.findByRole("cell", { name: "No" })).toBeVisible();
    expect(row.getByRole("button", { name: "Appoint as Administrator" })).toBeVisible();
    expect(actsSent(api)).toEqual([
      `POST /api/viewers/${reader.id}/administrator`,
      `DELETE /api/viewers/${reader.id}/administrator`,
    ]);
  });

  it("Deactivates a Viewer, and reactivates them again", async () => {
    const api = aBankHolding([anAdministrator, reader]);
    renderTheWholeClient("/administration/viewers");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Deactivate" }));
    expect(await row.findByRole("cell", { name: "Deactivated" })).toBeVisible();

    await userEvent.click(row.getByRole("button", { name: "Reactivate" }));
    expect(await row.findByRole("cell", { name: "Active" })).toBeVisible();
    expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
    expect(actsSent(api)).toEqual([
      `POST /api/viewers/${reader.id}/deactivation`,
      `DELETE /api/viewers/${reader.id}/deactivation`,
    ]);
  });

  it.each([
    {
      act: "Withdraw Administrator",
      method: "DELETE",
      part: "administrator",
      refusal: "The last Administrator's authority cannot be withdrawn.",
    },
    {
      act: "Deactivate",
      method: "POST",
      part: "deactivation",
      refusal: "The last active Administrator cannot be Deactivated.",
    },
  ])("reports the refusal to $act the last Administrator on their row alone", async (refused) => {
    aBankHolding([anAdministrator, reader], (request) =>
      request.method === refused.method &&
      new URL(request.url).pathname === `/api/viewers/${anAdministrator.id}/${refused.part}`
        ? refusesWith(409, "conflict", refused.refusal)
        : undefined,
    );
    renderTheWholeClient("/administration/viewers");

    const row = await rowFor("reviewer@iqb.test");
    await userEvent.click(row.getByRole("button", { name: refused.act }));

    const alert = within(await row.findByRole("alert"));
    expect(alert.getByText(refused.refusal)).toBeVisible();
    expect(row.getByRole("cell", { name: "Yes" })).toBeVisible();
    expect(row.getByRole("cell", { name: "Active" })).toBeVisible();
    expect((await rowFor("reader@iqb.test")).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("takes the console link away from an Administrator who withdraws their own authority", async () => {
    const another = aViewer({
      id: "7c3b4a1e-0000-4000-8000-000000000006",
      email: "other@iqb.test",
      isAdministrator: true,
    });
    aBankHolding([anAdministrator, another]);
    renderTheWholeClient("/administration/viewers");

    const header = within(await screen.findByRole("banner"));
    expect(header.getByRole("link", { name: "Administration" })).toBeVisible();
    const row = await rowFor("reviewer@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Withdraw Administrator" }));

    expect(await row.findByRole("cell", { name: "No" })).toBeVisible();
    expect(header.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  });
});
