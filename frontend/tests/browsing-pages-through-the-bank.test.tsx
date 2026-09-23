import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { browsePageSize } from "@/features/questions/questions.queries";
import { replaceSession } from "@/platform/session";
import { aQuestion } from "./helpers/fake-api";
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

/** A page of `count` Questions whose text says where in the bank each one sits. */
function questionsFrom(offset: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    aQuestion({
      id: `a0000000-0000-4000-8000-${String(offset + index).padStart(12, "0")}`,
      text: `Question number ${offset + index + 1}`,
    }),
  );
}

/** A bank of `size` Questions, cut into pages the way the API cuts them. */
function aBankOf(size: number) {
  return (asked: URL) => {
    const offset = Number(asked.searchParams.get("offset"));
    const limit = Number(asked.searchParams.get("limit"));
    return aPageOf(questionsFrom(offset, Math.max(Math.min(limit, size - offset), 0)), asked);
  };
}

describe("paging through the bank", () => {
  it("moves to the next page, and the address says which page it is on", async () => {
    const api = fakeBank(aBankOf(browsePageSize * 2 + 5));
    renderTheWholeClient("/?technology=react");
    await screen.findByText("Question number 1");

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText(`Question number ${browsePageSize + 1}`)).toBeVisible();
    expect(window.location.search).toBe(`?technology=react&offset=${browsePageSize}`);
    const asked = listRequests(api).at(-1)!;
    expect(asked.searchParams.get("offset")).toBe(String(browsePageSize));
    expect(asked.searchParams.getAll("technology")).toEqual(["react"]);
  });

  it("moves back to the page before", async () => {
    fakeBank(aBankOf(browsePageSize * 2 + 5));
    renderTheWholeClient(`/?offset=${browsePageSize}`);
    await screen.findByText(`Question number ${browsePageSize + 1}`);

    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));

    expect(await screen.findByText("Question number 1")).toBeVisible();
  });

  it("offers no page before the first", async () => {
    fakeBank(aBankOf(browsePageSize * 2));
    renderTheWholeClient("/");
    await screen.findByText("Question number 1");

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  // The API sends no total (ADR-0025), so a page that came back short is the only sign
  // there is nothing after it.
  it("offers no next page once a page comes back short", async () => {
    fakeBank(aBankOf(5));
    renderTheWholeClient("/");
    await screen.findByText("Question number 5");

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("says there are no more when a full last page led to an empty one", async () => {
    fakeBank(aBankOf(browsePageSize));
    renderTheWholeClient(`/?offset=${browsePageSize}`);

    expect(await screen.findByText("There are no more Questions.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled());
  });
});
