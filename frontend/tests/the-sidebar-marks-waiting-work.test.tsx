import type { Question, RoleRequest, Viewer } from "@iqb/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { chooseSidebarShrunk } from "@/platform/sidebar-choice";
import {
  aQuestion,
  aRoleRequest,
  aViewer,
  anAdministrator,
  answersWith,
  type FakeApi,
} from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

const aReviewer = aViewer({
  id: "7c3b4a1e-0000-4000-8000-000000000006",
  email: "reviewer@iqb.test",
  role: "reviewer",
});

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs(aReviewer);
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const waiting = aQuestion({
  id: "a0000000-0000-4000-8000-000000000021",
  text: "What does a database index cost on every write?",
  publicationState: "pending",
});

/** A bank whose Pending list holds `pending`, and which takes each Published one out of it. */
function aBankWaitingOn(pending: Question[]): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (asked.pathname === "/api/questions/pending") return aPageOf(pending, asked);
      const published = /^\/api\/questions\/([^/]+)\/publish$/.exec(asked.pathname);
      if (published === null || request.method !== "POST") return undefined;
      const moved = pending.find(({ id }) => id === published[1]);
      if (moved === undefined) throw new Error(`The Pending list does not hold ${published[1]}.`);
      pending.splice(pending.indexOf(moved), 1);
      return answersWith({ question: { ...moved, publicationState: "published" } });
    },
  );
}

async function theSidebar() {
  return within(await screen.findByRole("navigation", { name: "Main menu" }));
}

function requestsFor(path: string, api: FakeApi): Request[] {
  return api.sent.filter((request) => new URL(request.url).pathname === path);
}

function pendingListRequests(api: FakeApi): Request[] {
  return requestsFor("/api/questions/pending", api);
}

describe("the dot on Review queue", () => {
  it("shows when a Pending Question is waiting, and says so to a screen reader", async () => {
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    expect(
      await sidebar.findByRole("link", { name: "Review queue, Pending Questions waiting" }),
    ).toBeVisible();
  });

  it("does not show when nothing is waiting", async () => {
    const api = aBankWaitingOn([]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await vi.waitFor(() => expect(pendingListRequests(api)).toHaveLength(1));
    await screen.findByText("The bank has no Questions yet");
    expect(sidebar.getByRole("link", { name: "Review queue" })).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["an Author", aViewer({ role: "author" })],
    ["an Administrator who is not a Reviewer", aViewer({ role: "author", isAdministrator: true })],
  ])("is not asked for by %s", async (_who, viewer) => {
    signInAs(viewer);
    const api = aBankWaitingOn([waiting]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Browse" });
    await screen.findByText("The bank has no Questions yet");
    expect(pendingListRequests(api)).toHaveLength(0);
  });

  it("clears without a reload when the last waiting Question is Published", async () => {
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/review");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Review queue, Pending Questions waiting" });
    const queue = await screen.findByRole("list", { name: "Pending Questions" });
    await userEvent.click(within(queue).getByRole("button", { name: "Publish" }));

    expect(await sidebar.findByRole("link", { name: "Review queue" })).toBeVisible();
  });
});

const openRequests = [
  aRoleRequest({ id: "d0000000-0000-4000-8000-000000000021" }),
  aRoleRequest({ id: "d0000000-0000-4000-8000-000000000022" }),
  aRoleRequest({ id: "d0000000-0000-4000-8000-000000000023" }),
];

/** A bank whose open Role Request list holds `open`, and which takes each decided one out of it. */
function aBankWithOpenRoleRequests(open: RoleRequest[]): FakeApi {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (request, asked) => {
      if (asked.pathname === "/api/role-requests") return answersWith({ roleRequests: open });
      const decided = /^\/api\/role-requests\/([^/]+)\/decision$/.exec(asked.pathname);
      if (decided === null || request.method !== "POST") return undefined;
      const index = open.findIndex(({ id }) => id === decided[1]);
      if (index === -1) throw new Error(`The open list does not hold ${decided[1]}.`);
      const [roleRequest] = open.splice(index, 1);
      return answersWith({
        roleRequest: { ...roleRequest, state: "granted", decidedAt: "2026-09-03T09:00:00.000Z" },
      });
    },
  );
}

describe("the number beside Role Requests", () => {
  beforeEach(() => {
    signInAs(anAdministrator);
  });

  it("shows how many are open, and says so to a screen reader", async () => {
    aBankWithOpenRoleRequests([...openRequests]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    const link = await sidebar.findByRole("link", { name: "Role Requests, 3 open" });
    expect(within(link).getByText("3")).toBeVisible();
  });

  it("does not show when none is open", async () => {
    const api = aBankWithOpenRoleRequests([]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await vi.waitFor(() => expect(requestsFor("/api/role-requests", api)).toHaveLength(1));
    await screen.findByText("The bank has no Questions yet");
    expect(sidebar.getByRole("link", { name: "Role Requests" })).toBeVisible();
  });

  it.each<[string, Viewer]>([
    ["a Reader", aViewer({ role: "reader" })],
    ["an Author", aViewer({ role: "author" })],
    ["a Reviewer who is not an Administrator", aReviewer],
  ])("is not asked for by %s", async (_who, viewer) => {
    signInAs(viewer);
    const api = aBankWithOpenRoleRequests([...openRequests]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Browse" });
    await screen.findByText("The bank has no Questions yet");
    expect(requestsFor("/api/role-requests", api)).toHaveLength(0);
  });

  it("follows the list down, and clears without a reload when the last is decided", async () => {
    aBankWithOpenRoleRequests([openRequests[0]!, openRequests[1]!]);
    renderTheWholeClient("/administration/role-requests");

    const sidebar = await theSidebar();
    await sidebar.findByRole("link", { name: "Role Requests, 2 open" });
    const table = await screen.findByRole("table", { name: "Open Role Requests" });
    const [firstGrant] = within(table).getAllByRole("button", { name: "Grant" });
    await userEvent.click(firstGrant!);

    await sidebar.findByRole("link", { name: "Role Requests, 1 open" });
    await userEvent.click(within(table).getByRole("button", { name: "Grant" }));

    expect(await sidebar.findByRole("link", { name: "Role Requests" })).toBeVisible();
  });
});

describe("a mark in the shrunk strip", () => {
  beforeEach(() => {
    chooseSidebarShrunk(true);
  });

  afterEach(() => {
    // The choice is kept in storage, and one jsdom serves every test here.
    chooseSidebarShrunk(false);
    window.localStorage.clear();
  });

  it("is named in the icon's tooltip", async () => {
    aBankWaitingOn([waiting]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    const name = "Review queue, Pending Questions waiting";
    (await sidebar.findByRole("link", { name })).focus();

    expect(await screen.findByRole("tooltip", { name })).toBeInTheDocument();
  });

  it("gives the number in the icon's tooltip, where there is no room for digits", async () => {
    signInAs(anAdministrator);
    aBankWithOpenRoleRequests([...openRequests]);
    renderTheWholeClient("/questions");

    const sidebar = await theSidebar();
    const name = "Role Requests, 3 open";
    (await sidebar.findByRole("link", { name })).focus();

    expect(await screen.findByRole("tooltip", { name })).toBeInTheDocument();
  });
});
