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

const newcomer = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000010",
  email: "newcomer@iqb.test",
  role: "reviewer",
});

/** A bank holding `viewers`, which answers a create with `created` and adds a Viewer it
 * made to the list it sends next. */
function aBankCreatingViewers(viewers: Viewer[], created: () => Response) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    async (request, asked) => {
      if (asked.pathname !== "/api/viewers") return undefined;
      if (request.method === "GET") return answersWith({ viewers });
      const answer = created();
      if (answer.ok) viewers.push(((await answer.clone().json()) as { viewer: Viewer }).viewer);
      return answer;
    },
  );
}

function creations(api: ReturnType<typeof fakeBank>): Request[] {
  return api.sent.filter(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/api/viewers",
  );
}

async function theCreateForm() {
  await userEvent.click(await screen.findByRole("button", { name: "Add a Viewer" }));
  return within(await screen.findByRole("form", { name: "Create a Viewer" }));
}

describe("creating a Viewer from the administration console", () => {
  it("sends the email and role typed, and lists the new Viewer", async () => {
    const api = aBankCreatingViewers([anAdministrator], () =>
      answersWith({ viewer: newcomer }, 201),
    );
    renderTheWholeClient("/administration/viewers");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Email"), "Newcomer@iqb.test");
    await userEvent.selectOptions(form.getByLabelText("Role"), "Reviewer");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    expect(await screen.findByText(/newcomer@iqb\.test was created/)).toBeVisible();
    expect(screen.queryByRole("form", { name: "Create a Viewer" })).not.toBeInTheDocument();
    const [sent] = creations(api);
    expect(await sent?.json()).toEqual({ email: "newcomer@iqb.test", role: "reviewer" });
    const viewers = within(screen.getByRole("table", { name: "Viewers" }));
    expect(await viewers.findByText("newcomer@iqb.test")).toBeVisible();
  });

  it("refuses an address that is not one on its field, and sends nothing", async () => {
    const api = aBankCreatingViewers([anAdministrator], () =>
      answersWith({ viewer: newcomer }, 201),
    );
    renderTheWholeClient("/administration/viewers");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Email"), "not an address");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    const email = form.getByLabelText("Email");
    expect(email).toHaveAccessibleDescription("Enter an email address, like author@iqb.test.");
    expect(email).toHaveFocus();
    expect(creations(api)).toHaveLength(0);
  });

  it("reports the API's refusal of an address already in use, in its own words", async () => {
    aBankCreatingViewers([anAdministrator], () =>
      refusesWith(409, "conflict", "A Viewer with that email address already exists."),
    );
    renderTheWholeClient("/administration/viewers");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Email"), "reviewer@iqb.test");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    const refusal = within(await form.findByRole("alert"));
    expect(refusal.getByText("The Viewer was not created.")).toBeVisible();
    expect(refusal.getByText("A Viewer with that email address already exists.")).toBeVisible();
    expect(form.queryByRole("status")).not.toBeInTheDocument();
    expect(form.getByLabelText("Email")).toHaveValue("reviewer@iqb.test");
  });

  it("reports a field the API refused on that field", async () => {
    aBankCreatingViewers([anAdministrator], () =>
      refusesWith(400, "invalid_request", "The request body is not valid.", {
        errors: [],
        properties: { email: { errors: ["Invalid email address"] } },
      }),
    );
    renderTheWholeClient("/administration/viewers");

    const form = await theCreateForm();
    await userEvent.type(form.getByLabelText("Email"), "newcomer@iqb.test");
    await userEvent.click(form.getByRole("button", { name: "Create" }));

    const email = form.getByLabelText("Email");
    expect(
      await form.findByText("Enter an email address, like author@iqb.test."),
    ).toBeVisible();
    expect(email).toHaveAccessibleDescription("Enter an email address, like author@iqb.test.");
    expect(form.queryByText("The Viewer was not created.")).not.toBeInTheDocument();
  });
});
