// The code handed to `page.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers/sign-in-as-test-helper.ts";

/** A card that opens a Question, which is the kind that lifts when pointed at. */
function questionCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("link") }).first();
}

/** Where the card sits on the page, so a lift shows as a smaller number. */
async function cardTop(page: Page): Promise<number> {
  return questionCard(page).evaluate((card) => card.getBoundingClientRect().top);
}

test("a card that opens a Question lifts when pointed at", async ({ page }) => {
  await signInAs(page, "reader@iqb.test", "reader-password");
  await page.goto("/questions");
  await expect(questionCard(page)).toBeVisible();
  const before = await cardTop(page);

  await questionCard(page).hover();

  await expect.poll(() => cardTop(page)).toBeLessThan(before);
});

test("with reduced motion asked for, nothing lifts, glows or fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAs(page, "reader@iqb.test", "reader-password");
  // A running fade or lift shows up here, and so does one that has not started yet.
  const runningAnimations = () => page.evaluate(() => document.getAnimations().length);

  await page.getByRole("button", { name: "reader@iqb.test" }).click();
  await page.getByRole("menuitem", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  expect(await runningAnimations()).toBe(0);

  await page.goto("/questions");
  await expect(questionCard(page)).toBeVisible();
  const before = await cardTop(page);
  await questionCard(page).hover();
  expect(await runningAnimations()).toBe(0);
  expect(await cardTop(page)).toBe(before);
});
