import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { aClient, anAdministrator, answersWith, aQuestion } from "./helpers/fake-api";
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

const question = aQuestion();
const client = aClient();

// Each screen, the API path its list asks for, and what a screen reader hears meanwhile.
const lists = [
  ["/", "/api/questions", "Loading Questions…"],
  ["/questions/own", "/api/questions/own", "Loading your Questions…"],
  ["/review", "/api/questions/pending", "Loading the Pending Questions…"],
  ["/administration/role-requests", "/api/role-requests", "Loading the Role Requests…"],
  ["/administration/viewers", "/api/viewers", "Loading the Viewers…"],
  ["/administration/clients", "/api/clients/all", "Loading the Clients…"],
  [
    `/administration/clients/${client.id}`,
    `/api/clients/${client.id}/grants`,
    "Loading the Grants…",
  ],
  ["/account", "/api/role-requests/mine", "Loading your Role Requests…"],
  [`/questions/${question.id}`, `/api/questions/${question.id}/history`, "Loading the history…"],
] as const;

describe("a list the API has not answered yet", () => {
  it.each(lists)("on %s shows grey shapes, named only to a screen reader", async (at, held, heard) => {
    fakeBank(
      (asked) => aPageOf([], asked),
      (_request, asked) => {
        if (asked.pathname === held) return new Promise<Response>(() => {});
        if (asked.pathname === "/api/clients/all") return answersWith({ clients: [client] });
        if (asked.pathname === "/api/role-requests/mine") return answersWith({ roleRequests: [] });
        if (asked.pathname === `/api/questions/${question.id}`) return answersWith({ question });
        return undefined;
      },
    );

    renderTheWholeClient(at);

    const status = await screen.findByText(heard);
    expect(status).toHaveClass("sr-only");
    const shapes = status.closest('[role="status"]')?.querySelectorAll('[data-slot="skeleton"]');
    expect(shapes?.length).toBeGreaterThan(0);
  });
});
