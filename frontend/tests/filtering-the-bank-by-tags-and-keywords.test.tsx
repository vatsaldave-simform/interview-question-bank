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

function aBankWithOneQuestion() {
  return fakeBank((asked) => aPageOf([aQuestion()], asked));
}

async function tick(tag: string): Promise<void> {
  await userEvent.click(await screen.findByRole("checkbox", { name: tag }));
}

describe("filtering the bank", () => {
  it("offers the Tags the API listed, under each Category's own name", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/");

    const technology = await screen.findByRole("group", { name: "Technology" });
    expect(technology).toContainElement(screen.getByRole("checkbox", { name: "react" }));
    expect(screen.getByRole("group", { name: "Question type" })).toContainElement(
      screen.getByRole("checkbox", { name: "practical" }),
    );
  });

  it("sends several Tags in one Category and one in another together", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/");

    await tick("react");
    await tick("node");
    await tick("senior");

    await waitFor(() =>
      expect(window.location.search).toBe("?technology=react&technology=node&seniority=senior"),
    );
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.search).toBe(
        `?technology=react&technology=node&seniority=senior&limit=${browsePageSize}&offset=0`,
      ),
    );
  });

  it("stops sending a Tag once it is unticked", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/?technology=react&technology=node");

    await tick("react");

    await waitFor(() => expect(window.location.search).toBe("?technology=node"));
    await waitFor(() =>
      expect(listRequests(api).at(-1)!.searchParams.getAll("technology")).toEqual(["node"]),
    );
  });

  it("sends a submitted search with the Tags already chosen, in one request", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/?technology=react");
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
    renderTheWholeClient("/?technology=node&seniority=junior&keywords=closures");

    expect(await screen.findByRole("checkbox", { name: "node" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "junior" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "react" })).not.toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("closures");
  });

  // Page three of the old filter is not page three of the new one.
  it("goes back to the first page when the filter changes", async () => {
    const api = aBankWithOneQuestion();
    renderTheWholeClient("/?technology=react&offset=40");

    await tick("node");

    await waitFor(() => expect(window.location.search).toBe("?technology=react&technology=node"));
    await waitFor(() => expect(listRequests(api).at(-1)!.searchParams.get("offset")).toBe("0"));
  });

  it("clears every Tag and the search at once", async () => {
    aBankWithOneQuestion();
    renderTheWholeClient("/?technology=cobol&seniority=senior&keywords=cache");

    await userEvent.click(await screen.findByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByRole("checkbox", { name: "senior" })).not.toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
  });
});
