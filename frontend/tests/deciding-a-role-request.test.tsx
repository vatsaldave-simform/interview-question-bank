import type { RoleRequest, ViewerRole } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aRoleRequest, anAdministrator, answersWith, refusesWith } from "./helpers/fake-api";
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

const fromReader = aRoleRequest({
  viewer: { id: "7c3b4a1e-0000-4000-8000-000000000004", email: "reader@iqb.test" },
});
const fromAuthor = aRoleRequest({ id: "d0000000-0000-4000-8000-000000000002" });

/** A bank holding the `open` Role Requests, which takes each decided one out of the queue,
 * unless `refuse` answers first. */
function aBankDeciding(
  open: RoleRequest[],
  refuse: (request: Request) => Response | undefined = () => undefined,
) {
  // What the bank answers about the signed-in Administrator follows what it granted.
  const rolesGranted = new Map<string, ViewerRole>();
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/role-requests") return answersWith({ roleRequests: open });
      if (asked.pathname === "/api/auth/me") {
        const role = rolesGranted.get(anAdministrator.id) ?? anAdministrator.role;
        return answersWith({ viewer: { ...anAdministrator, role } });
      }
      const path = /^\/api\/role-requests\/([^/]+)\/decision$/.exec(asked.pathname);
      if (path === null) return undefined;
      const refused = refuse(request);
      if (refused !== undefined) return refused;
      const index = open.findIndex(({ id }) => id === path[1]);
      const decision = (await request.json()) as { outcome: "granted" | "denied"; reason?: string };
      const [decided] = open.splice(index, 1);
      if (decided !== undefined && decision.outcome === "granted") {
        rolesGranted.set(decided.viewer.id, decided.role);
      }
      return answersWith({
        roleRequest: {
          ...decided,
          state: decision.outcome,
          reason: decision.reason ?? null,
          decidedAt: "2026-09-03T09:00:00.000Z",
        },
      });
    },
  );
}

function decisionsSent(api: ReturnType<typeof fakeBank>): Request[] {
  return api.sent.filter((request) => new URL(request.url).pathname.endsWith("/decision"));
}

async function rowFor(email: string) {
  const table = await screen.findByRole("table", { name: "Open Role Requests" });
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(email) !== null);
  if (row === undefined) throw new Error(`No row for ${email}.`);
  return within(row);
}

describe("deciding a Role Request from the administration console", () => {
  it("grants a Role Request, which leaves the queue and changes the Viewer list", async () => {
    const api = aBankDeciding([fromReader, fromAuthor]);
    renderTheWholeClient("/administration");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Grant" }));

    const table = within(screen.getByRole("table", { name: "Open Role Requests" }));
    await vi.waitFor(() => expect(table.queryByText("reader@iqb.test")).not.toBeInTheDocument());
    expect(table.getByText("author@iqb.test")).toBeVisible();
    const [sent] = decisionsSent(api);
    expect(new URL(sent!.url).pathname).toBe(`/api/role-requests/${fromReader.id}/decision`);
    expect(await sent!.json()).toEqual({ outcome: "granted" });
    const asked = api.sent.map((request) => `${request.method} ${new URL(request.url).pathname}`);
    const decidedAt = asked.indexOf(`POST /api/role-requests/${fromReader.id}/decision`);
    expect(asked.slice(decidedAt)).toContain("GET /api/viewers");
  });

  it("refuses a denial with no reason on its field, and sends nothing", async () => {
    const api = aBankDeciding([fromReader]);
    renderTheWholeClient("/administration");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Deny" }));
    await userEvent.type(row.getByLabelText("Why it is denied"), "   ");
    await userEvent.click(row.getByRole("button", { name: "Send the denial" }));

    const reason = row.getByLabelText("Why it is denied");
    expect(reason).toHaveAccessibleDescription(
      "Say why, so they can act on it, in 2,000 characters or fewer.",
    );
    expect(reason).toHaveFocus();
    expect(decisionsSent(api)).toHaveLength(0);
  });

  it("denies a Role Request with the reason written, which leaves the queue", async () => {
    const api = aBankDeciding([fromReader]);
    renderTheWholeClient("/administration");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Deny" }));
    await userEvent.type(row.getByLabelText("Why it is denied"), "  Not on a project yet. ");
    await userEvent.click(row.getByRole("button", { name: "Send the denial" }));

    expect(await screen.findByText("No Role Request is waiting.")).toBeVisible();
    const [sent] = decisionsSent(api);
    expect(await sent!.json()).toEqual({ outcome: "denied", reason: "Not on a project yet." });
  });

  it("asks again after a refusal, and keeps the refusal on screen", async () => {
    const open = [fromReader, fromAuthor];
    aBankDeciding(open, (request) => {
      if (!request.url.includes(fromReader.id)) return undefined;
      // Decided a moment ago by another Administrator.
      open.splice(open.indexOf(fromReader), 1);
      return refusesWith(409, "conflict", "That Role Request has already been decided.");
    });
    renderTheWholeClient("/administration");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Grant" }));

    const queue = within(screen.getByRole("region", { name: "Open Role Requests" }));
    const alert = within(await queue.findByRole("alert"));
    expect(alert.getByText("The Role Request from reader@iqb.test was not decided.")).toBeVisible();
    expect(alert.getByText("That Role Request has already been decided.")).toBeVisible();
    const table = within(queue.getByRole("table"));
    await vi.waitFor(() => expect(table.queryByText("reader@iqb.test")).not.toBeInTheDocument());
    expect(alert.getByText("That Role Request has already been decided.")).toBeVisible();
  });

  it("changes the header of an Administrator who grants their own Role Request", async () => {
    const own = aRoleRequest({
      viewer: { id: anAdministrator.id, email: anAdministrator.email },
      role: "author",
    });
    aBankDeciding([own]);
    renderTheWholeClient("/administration");

    const header = within(await screen.findByRole("banner"));
    expect(header.getByText("reviewer")).toBeVisible();
    const row = await rowFor("reviewer@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Grant" }));

    expect(await header.findByText("author")).toBeVisible();
  });
});
