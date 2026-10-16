// The code handed to `page.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { questionCard } from "./helpers/question-card-test-helper.ts";
import { signInAs } from "./helpers/sign-in-as-test-helper.ts";

// A lift shows as a smaller number.
function cardTop(page: Page): Promise<number> {
  return questionCard(page).evaluate((card) => card.getBoundingClientRect().top);
}

// The glow is drawn on the card's `::after`, and shows when this reads "1".
function glowOpacity(page: Page): Promise<string> {
  return questionCard(page).evaluate((card) => getComputedStyle(card, "::after").opacity);
}

// A running fade or lift shows up here, and so does one that has not started yet.
function runningAnimations(page: Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().length);
}

test("a card that opens a Question lifts and glows when pointed at", async ({ page }) => {
  await signInAs(page, "reader@iqb.test", "reader-password");
  await page.goto("/questions");
  await expect(questionCard(page)).toBeVisible();
  const before = await cardTop(page);

  await questionCard(page).hover();

  await expect.poll(() => cardTop(page)).toBeLessThan(before);
  await expect.poll(() => glowOpacity(page)).toBe("1");
});

test("with reduced motion asked for, nothing lifts, glows or fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAs(page, "reader@iqb.test", "reader-password");

  await page.getByRole("button", { name: "reader@iqb.test" }).click();
  await expect(page.getByRole("menuitem", { name: "Your account" })).toBeVisible();
  expect(await runningAnimations(page)).toBe(0);
  await page.getByRole("menuitem", { name: "Your account" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  expect(await runningAnimations(page)).toBe(0);

  await page.goto("/questions");
  await expect(questionCard(page)).toBeVisible();
  const before = await cardTop(page);
  await questionCard(page).hover();
  expect(await runningAnimations(page)).toBe(0);
  expect(await cardTop(page)).toBe(before);
  expect(await glowOpacity(page)).toBe("0");
});
