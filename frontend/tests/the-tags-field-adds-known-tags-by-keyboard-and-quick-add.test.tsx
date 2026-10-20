import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopRenewingSession } from "@/features/auth/sign-in";
import { replaceSession } from "@/platform/session";
import { answersWith, theCategories } from "./helpers/fake-api";
import { aPageOf, fakeBank, signInAs } from "./helpers/fake-bank";
import { renderTheWholeClient } from "./helpers/the-whole-client";

beforeEach(() => {
  replaceSession({ status: "unknown" });
  signInAs();
});

afterEach(() => {
  stopRenewingSession();
  vi.unstubAllGlobals();
});

const manyTechnologies = ["dart", "flutter", "go", "java", "node", "python", "react", "rust"];

function aBank(categories = theCategories) {
  return fakeBank(
    (asked) => aPageOf([], asked),
    (_request, asked) =>
      asked.pathname === "/api/categories" ? answersWith(categories) : undefined,
  );
}

async function theTagsBox(): Promise<HTMLElement> {
  return screen.findByRole("combobox", { name: "Tags" });
}

function chosenTags(): string[] {
  const list = screen.queryByRole("list", { name: "Chosen Tags" });
  if (list === null) return [];
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("the Tags field, by keyboard alone", () => {
  it("lists the known Tags that match what is typed, under each Category", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("e");

    const list = screen.getByRole("listbox", { name: "Known Tags" });
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(
      within(within(list).getByRole("group", { name: "Technology" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["node", "react", "typescript"]);
    expect(
      within(within(list).getByRole("group", { name: "Seniority" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["senior"]);
  });

  it("moves with the arrow keys and adds the Tag picked with Enter, then says so", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "typescript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.keyboard("{ArrowUp}{Enter}");

    expect(chosenTags()).toEqual(["react"]);
    expect(screen.getByText("Added react, a Technology Tag.")).toBeInTheDocument();
    expect(box).toHaveFocus();
    expect(screen.queryByRole("option", { name: "react" })).not.toBeInTheDocument();
  });

  it("adds the Tag typed in full when a comma follows it", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("senior,");

    expect(chosenTags()).toEqual(["senior"]);
    expect(box).toHaveValue("");
  });

  it("shows the chosen Tags in the Categories' order, whatever order they were added in", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("practical,mid,node,");

    expect(chosenTags()).toEqual(["node", "mid", "practical"]);
  });

  it("removes the last Tag with Backspace in an empty box, then says so", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());
    await userEvent.keyboard("node,senior,");

    await userEvent.keyboard("{Backspace}");

    expect(chosenTags()).toEqual(["node"]);
    expect(screen.getByText("Removed senior.")).toBeInTheDocument();
  });

  it("offers nothing for text that matches no Tag, and adds nothing", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("cobol{Enter}");

    expect(screen.getByRole("listbox", { name: "Known Tags" })).toHaveTextContent("No Tag matches");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(chosenTags()).toEqual([]);
    expect(box).toHaveValue("cobol");
  });

  it("closes the list with Escape", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(box).toHaveAttribute("aria-expanded", "true");

    await userEvent.keyboard("{Escape}");

    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("removes a chosen Tag with its own button", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());
    await userEvent.keyboard("node,mid,");

    await userEvent.click(screen.getByRole("button", { name: "Remove node" }));

    expect(chosenTags()).toEqual(["mid"]);
    expect(box).toHaveFocus();
  });

  it("ticks each Category that has a Tag, and counts the Tags", async () => {
    aBank();
    renderTheWholeClient("/questions/new");
    const box = await theTagsBox();
    act(() => box.focus());

    await userEvent.keyboard("node,react,");

    expect(screen.getByText("Technology: 2")).toBeVisible();
    expect(screen.getByText("Seniority: none")).toBeVisible();
    expect(screen.getByText("2 Tags")).toBeVisible();
  });
});

describe("Quick add", () => {
  it("adds a Tag in one click, from any Category, and stops offering it", async () => {
    aBank();
    renderTheWholeClient("/questions/new");

    await userEvent.click(await screen.findByRole("button", { name: "Add senior" }));
    await userEvent.click(screen.getByRole("button", { name: "Add practical" }));

    expect(chosenTags()).toEqual(["senior", "practical"]);
    expect(screen.queryByRole("button", { name: "Add senior" })).not.toBeInTheDocument();
    expect(screen.getByText("Added practical, a Question type Tag.")).toBeInTheDocument();
  });

  it("shows six of a Category's Tags, and the rest on asking", async () => {
    aBank({
      categories: [
        { name: "technology", displayName: "Technology", tags: manyTechnologies },
        ...theCategories.categories.slice(1),
      ],
    });
    renderTheWholeClient("/questions/new");

    const row = within(
      await screen.findByRole("group", { name: "Quick add Technology Tags" }),
    );
    expect(row.queryByRole("button", { name: "Add rust" })).not.toBeInTheDocument();

    await userEvent.click(row.getByRole("button", { name: "Show 2 more Technology Tags" }));

    expect(row.getByRole("button", { name: "Add rust" })).toBeVisible();
    await userEvent.click(row.getByRole("button", { name: "Fewer" }));
    expect(row.queryByRole("button", { name: "Add rust" })).not.toBeInTheDocument();
  });
});
