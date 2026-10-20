import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { questionPageSize } from "@/features/questions/question-pages.schema";
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

function aBankWithOneQuestion() {
  return fakeBank((asked) => aPageOf([aQuestion()], asked));
}

function pillFor(category: string): Promise<HTMLElement> {
  return screen.findByRole("button", { name: new RegExp(`^${category} ·`) });
}

/** Opens the Category's pill, so its Tags are on screen. */
async function openPill(category: string): Promise<ReturnType<typeof within>> {
  await userEvent.click(await pillFor(category));
  return within(await screen.findByRole("menu"));
}

async function pick(category: string, tag: string): Promise<void> {
  const menu = await openPill(category);
  await userEvent.click(menu.getByRole("menuitemcheckbox", { name: tag }));
  await userEvent.keyboard("{Escape}");
}

describe("filtering the bank", () => {
  it("offers one pill per Category, under its own name, holding the Tags the API listed", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions");

    expect(await pillFor("Technology")).toHaveAccessibleName("Technology · Any");
    expect(await pillFor("Seniority")).toHaveAccessibleName("Seniority · Any");
    expect(await pillFor("Question type")).toHaveAccessibleName("Question type · Any");

    const menu = await openPill("Question type");
    expect(menu.getAllByRole("menuitemcheckbox").map((item: HTMLElement) => item.textContent)).toEqual([
      "conceptual",
      "practical",
    ]);
  });

  it("keeps the menu open, so several Tags can be picked in one go", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions");

    const menu = await openPill("Technology");
    await userEvent.click(menu.getByRole("menuitemcheckbox", { name: "react" }));
    await userEvent.click(menu.getByRole("menuitemcheckbox", { name: "node" }));

    await waitFor(() => expect(window.location.search).toBe("?technology=react&technology=node"));
    expect(menu.getByRole("menuitemcheckbox", { name: "react" })).toBeChecked();
    expect(menu.getByRole("menuitemcheckbox", { name: "node" })).toBeChecked();
    expect(menu.getByRole("menuitemcheckbox", { name: "typescript" })).not.toBeChecked();
  });

  it("names the one Tag picked on its pill, or how many", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=react&technology=node&seniority=senior");

    expect(await pillFor("Technology")).toHaveAccessibleName("Technology · 2 chosen");
    expect(await pillFor("Seniority")).toHaveAccessibleName("Seniority · senior");
    expect(await pillFor("Question type")).toHaveAccessibleName("Question type · Any");
  });

  it("sends several Tags in one Category and one in another together", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/questions");

    await pick("Technology", "react");
    await pick("Technology", "node");
    await pick("Seniority", "senior");

    await waitFor(() =>
      expect(window.location.search).toBe("?technology=react&technology=node&seniority=senior"),
    );
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.search).toBe(
        `?technology=react&technology=node&seniority=senior&limit=${questionPageSize}&offset=0`,
      ),
    );
  });

  it("stops sending a Tag once it is unticked", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=react&technology=node");

    await pick("Technology", "react");

    await waitFor(() => expect(window.location.search).toBe("?technology=node"));
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.getAll("technology")).toEqual(["node"]),
    );
  });

  it("sends a submitted search with the Tags already chosen, in one request", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=react");
    await screen.findByText(aQuestion().text);
    const before = listRequests(api).length;

    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "cache miss{Enter}");

    await waitFor(() => expect(listRequests(api)).toHaveLength(before + 1));
    const asked = listRequests(api).at(-1)!;
    expect(asked.searchParams.get("keywords")).toBe("cache miss");
    expect(asked.searchParams.getAll("technology")).toEqual(["react"]);
    expect(window.location.search).toBe("?technology=react&keywords=cache+miss");
  });

  it("shows what the address names when the page is opened", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=node&seniority=junior&keywords=closures");

    expect(await pillFor("Seniority")).toHaveAccessibleName("Seniority · junior");
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("closures");
    const menu = await openPill("Technology");
    expect(menu.getByRole("menuitemcheckbox", { name: "node" })).toBeChecked();
    expect(menu.getByRole("menuitemcheckbox", { name: "react" })).not.toBeChecked();
  });

  // Page three of the old filter is not page three of the new one.
  it("goes back to the first page when the filter changes", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=react&offset=40");

    await pick("Technology", "node");

    await waitFor(() => expect(window.location.search).toBe("?technology=react&technology=node"));
    await waitFor(() => expect(listRequests(api).at(-1)!.searchParams.get("offset")).toBe("0"));
  });

  it("offers Clear filters only once a filter is set", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions");
    await screen.findByText(aQuestion().text);

    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await pick("Seniority", "mid");

    expect(await screen.findByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  it("clears every Tag and the search at once", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/questions?technology=cobol&seniority=senior&keywords=cache");

    await userEvent.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(await pillFor("Seniority")).toHaveAccessibleName("Seniority · Any");
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("keeps the controls in step when the browser goes Back and Forward", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/questions");
    await pick("Technology", "react");
    await waitFor(() => expect(window.location.search).toBe("?technology=react"));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "cache{Enter}");
    await waitFor(() => expect(window.location.search).toBe("?technology=react&keywords=cache"));

    window.history.back();

    await waitFor(() => expect(window.location.search).toBe("?technology=react"));
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue(""));
    expect(await pillFor("Technology")).toHaveAccessibleName("Technology · react");

    window.history.back();

    await waitFor(async () =>
      expect(await pillFor("Technology")).toHaveAccessibleName("Technology · Any"),
    );
    await waitFor(() => expect(listRequests(api).at(-1)!.search).not.toContain("technology"));

    window.history.forward();

    await waitFor(async () =>
      expect(await pillFor("Technology")).toHaveAccessibleName("Technology · react"),
    );
  });
});
