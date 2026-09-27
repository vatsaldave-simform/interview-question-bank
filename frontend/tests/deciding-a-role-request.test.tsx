import type { RoleRequest } from "@iqb/shared";
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
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/role-requests") return answersWith({ roleRequests: open });
      const path = /^\/api\/role-requests\/([^/]+)\/decision$/.exec(asked.pathname);
      if (path === null) return undefined;
      const refused = refuse(request);
      if (refused !== undefined) return refused;
      const index = open.findIndex(({ id }) => id === path[1]);
      const decision = (await request.json()) as { outcome: "granted" | "denied"; reason?: string };
      const [decided] = open.splice(index, 1);
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

  it("reports the API's refusal of a decision on that Role Request alone", async () => {
    aBankDeciding([fromReader, fromAuthor], (request) =>
      request.url.includes(fromReader.id)
        ? refusesWith(409, "conflict", "That Role Request has already been decided.")
        : undefined,
    );
    renderTheWholeClient("/administration");

    const row = await rowFor("reader@iqb.test");
    await userEvent.click(row.getByRole("button", { name: "Grant" }));

    const alert = within(await row.findByRole("alert"));
    expect(alert.getByText("That was not done.")).toBeVisible();
    expect(alert.getByText("That Role Request has already been decided.")).toBeVisible();
    expect((await rowFor("author@iqb.test")).queryByRole("alert")).not.toBeInTheDocument();
  });
});
