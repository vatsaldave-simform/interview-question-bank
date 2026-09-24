import { expect, test } from "@playwright/test";

const typeScriptQuestion = "Explain the difference between a type and an interface in TypeScript.";
// Pending and the Author's own, so the Author sees it, and it carries no TypeScript Tag.
const behaviouralQuestion =
  "Describe a time you disagreed with a technical decision and what you did about it.";

test("the client reaches the API", async ({ page }) => {
  await page.goto("/");

  // The login form appears only after the client has asked the API for a session and been
  // told there is none.
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill("author@iqb.test");
  await page.getByLabel("Password", { exact: true }).fill("author-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("link", { name: typeScriptQuestion })).toBeVisible();
  await expect(page.getByRole("link", { name: behaviouralQuestion })).toBeVisible();

  // The list is empty while the filtered page loads, so a missing Question proves nothing
  // until the API has answered.
  const filtered = page.waitForResponse(
    (response) =>
      response.url().includes("/api/questions?") &&
      response.url().includes("technology=typescript"),
  );
  const filters = page.getByRole("complementary", { name: "Filters" });
  await filters.getByRole("checkbox", { name: "typescript", exact: true }).check();
  await filtered;

  await expect(page).toHaveURL(/[?&]technology=typescript\b/);
  await expect(page.getByRole("link", { name: typeScriptQuestion })).toBeVisible();
  await expect(page.getByRole("link", { name: behaviouralQuestion })).toHaveCount(0);

  await page.getByRole("link", { name: "Add a Question" }).click();

  const newQuestionText =
    `How would you explain what run ${Date.now()} of the browser test checks?`;
  await page.getByLabel("Question", { exact: true }).fill(newQuestionText);
  await page
    .getByLabel("Answer Notes", { exact: true })
    .fill("That the client and the API connect.");
  await page.getByRole("checkbox", { name: "typescript", exact: true }).check();
  await page.getByRole("button", { name: "Add the Question" }).click();

  await expect(page).toHaveURL(/\/questions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: newQuestionText })).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
});
