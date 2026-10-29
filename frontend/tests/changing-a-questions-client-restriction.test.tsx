import type { Client, Question, RestrictQuestionRequest } from "@iqb/shared";
import { screen, waitFor, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import type { RestrictionChange } from "@/features/questions/questions.queries";
import { replaceSession } from "@/platform/session";
import { aQuestion, aViewer, answersWith, refusesWith, type FakeApi } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";
import { theToastSaying, toastsShown } from "./helpers/toasts";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const acme: Client = { id: "c0000000-0000-4000-8000-000000000001", name: "Acme" };
const globex: Client = { id: "c0000000-0000-4000-8000-000000000002", name: "Globex" };

const aReviewer = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000006",
  email: "reviewer@iqb.test",
  role: "reviewer",
});

const restricted = aQuestion({
  id: "a0000000-0000-4000-8000-000000000062",
  text: "What would you change first in Acme's billing service?",
  clients: [acme],
});

const unrestricted = aQuestion({
  id: "a0000000-0000-4000-8000-000000000061",
  text: "How would you migrate this reporting pipeline?",
  publicationState: "pending",
});

type BankOptions = {
  listed?: Client[];
  /** Answers a restriction change first, when a test wants it refused. `changeElsewhere`
   * changes the Question the way another Viewer would have. */
  refuse?: (
    act: RestrictionChange["act"],
    changeElsewhere: (changes: Partial<Question>) => void,
  ) => Response | undefined;
};

/** Holds `question` and changes its restriction the way the API would. */
function aBankHolding(question: Question, options: BankOptions = {}): FakeApi {
  const { listed = [acme, globex], refuse } = options;
  let current = question;
  const changeElsewhere = (changes: Partial<Question>) => {
    current = { ...current, ...changes };
  };
  return fakeBank(
    (asked) => aPageOf([current], asked),
    async (request, asked) => {
      if (asked.pathname === "/api/clients") return answersWith({ clients: listed });
      if (asked.pathname === `/api/questions/${question.id}/history`) {
        return answersWith({ events: [] });
      }
      if (asked.pathname === `/api/questions/${question.id}`) {
        return answersWith({ question: current });
      }
      const act = /^\/api\/questions\/[^/]+\/(restrict|remove-restriction)$/.exec(
        asked.pathname,
      )?.[1] as RestrictionChange["act"] | undefined;
      if (act === undefined || request.method !== "POST") return undefined;
      const refused = refuse?.(act, changeElsewhere);
      if (refused !== undefined) return refused;
      if (act === "remove-restriction") {
        current = { ...current, clients: [] };
      } else {
        const { clientId } = (await request.json()) as RestrictQuestionRequest;
        current = { ...current, clients: listed.filter(({ id }) => id === clientId) };
      }
      return answersWith({ question: current });
    },
  );
}

/** The restriction changes the page sent, as the act and the body it sent. */
async function changesSent(api: FakeApi): Promise<unknown[]> {
  const changes = api.sent.filter(
    (request) => request.method === "POST" && /\/(restrict|remove-restriction)$/.test(request.url),
  );
  return Promise.all(
    changes.map(async (request) => ({
      act: request.url.split("/").at(-1),
      body: request.headers.has("content-type") ? await request.json() : undefined,
    })),
  );
}

async function restrictTo(name: string): Promise<void> {
  await userEvent.selectOptions(
    await screen.findByRole("combobox", { name: "Restrict to a Client" }),
    name,
  );
  await userEvent.click(screen.getByRole("button", { name: "Restrict" }));
}

describe("changing a Question's Client restriction", () => {
  it("lets an Author restrict their own Question, and shows the new restriction", async () => {
    const api = aBankHolding(unrestricted);
    renderTheWholeClient(`/questions/${unrestricted.id}/edit`);

    await restrictTo("Acme");

    expect(await screen.findByRole("list", { name: "Clients" })).toHaveTextContent("Acme");
    expect(await theToastSaying("It is now restricted to Acme.")).toBeVisible();
    expect(await changesSent(api)).toEqual([{ act: "restrict", body: { clientId: acme.id } }]);

    const trail = within(screen.getByRole("navigation", { name: "breadcrumb" }));
    await userEvent.click(trail.getByRole("link", { name: unrestricted.text }));
    await screen.findByRole("heading", { level: 1, name: unrestricted.text });
    expect(screen.getByRole("list", { name: "Clients" })).toHaveTextContent("Acme");
  });

  it("keeps the restriction in a card of its own, apart from the edit's Save", async () => {
    aBankHolding(restricted);
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    const whoCanSeeIt = await screen.findByRole("region", { name: "Who can see it" });
    expect(within(whoCanSeeIt).getByRole("list", { name: "Clients" })).toHaveTextContent("Acme");
    expect(await within(whoCanSeeIt).findByRole("button", { name: "Restrict" })).toBeVisible();
    expect(within(whoCanSeeIt).queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getAllByRole("list", { name: "Clients" })).toHaveLength(1);
  });

  it("lets a Reviewer remove a restriction, and shows it is gone", async () => {
    signInAs(aReviewer);
    const api = aBankHolding(restricted);
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    await userEvent.click(await screen.findByRole("button", { name: "Remove the restriction" }));

    await waitFor(() => expect(screen.queryByRole("list", { name: "Clients" })).toBeNull());
    expect(await changesSent(api)).toEqual([{ act: "remove-restriction", body: undefined }]);
    expect(await theToastSaying("The restriction was removed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove the restriction" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Restrict to a Client" })).toHaveDisplayValue(
      "No restriction",
    );
  });

  it("shows the API's refusal when an Author tries to remove a restriction", async () => {
    aBankHolding(restricted, {
      refuse: (act) =>
        act === "remove-restriction"
          ? refusesWith(403, "forbidden", "Only a Reviewer may remove a Client restriction.")
          : undefined,
    });
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    await userEvent.click(await screen.findByRole("button", { name: "Remove the restriction" }));

    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("The restriction was not changed.");
    expect(refusal).toHaveTextContent("Only a Reviewer may remove a Client restriction.");
    expect(screen.getByRole("list", { name: "Clients" })).toHaveTextContent("Acme");
    expect(toastsShown()).toHaveLength(0);
  });

  it("shows the API's refusal to move a Published Question to another Client", async () => {
    const moveRefused =
      "A Published Question cannot be moved to another Client. A Reviewer can return it to " +
      "you, and you can move it then.";
    aBankHolding(restricted, {
      refuse: (act) =>
        act === "restrict" ? refusesWith(403, "forbidden", moveRefused) : undefined,
    });
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    // It already is restricted to Acme, so there is nothing to send until another is chosen.
    await screen.findByRole("combobox", { name: "Restrict to a Client" });
    expect(screen.getByRole("button", { name: "Restrict" })).toBeDisabled();
    await restrictTo("Globex");

    expect(await screen.findByRole("alert")).toHaveTextContent(moveRefused);
    expect(screen.getByRole("list", { name: "Clients" })).toHaveTextContent("Acme");
    expect(toastsShown()).toHaveLength(0);
  });

  it("shows no Client section on an unrestricted Question when there is no Client", async () => {
    aBankHolding(unrestricted, { listed: [] });
    renderTheWholeClient(`/questions/${unrestricted.id}/edit`);

    await screen.findByLabelText("Question");
    await waitForElementToBeRemoved(() => screen.queryByText("Loading the Clients…"));
    expect(screen.queryByRole("heading", { name: "Who can see it" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Restrict to a Client" })).toBeNull();
    expect(screen.queryByText(/Client|restriction/)).toBeNull();
  });

  it("keeps the refusal on screen when someone else changed the restriction first", async () => {
    signInAs(aReviewer);
    const removedFirst = "This Question has no Client restriction to remove.";
    aBankHolding(restricted, {
      refuse: (act, changeElsewhere) => {
        if (act !== "remove-restriction") return undefined;
        changeElsewhere({ clients: [] });
        return refusesWith(409, "conflict", removedFirst);
      },
    });
    renderTheWholeClient(`/questions/${restricted.id}/edit`);

    await userEvent.click(await screen.findByRole("button", { name: "Remove the restriction" }));

    // Gone once the Question is asked for again, which is when the refusal used to vanish.
    await waitFor(() => expect(screen.queryByRole("list", { name: "Clients" })).toBeNull());
    expect(screen.getByRole("alert")).toHaveTextContent(removedFirst);
  });
});
