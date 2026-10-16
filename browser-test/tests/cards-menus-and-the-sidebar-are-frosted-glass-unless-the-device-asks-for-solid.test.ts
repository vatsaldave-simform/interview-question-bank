// The code handed to `locator.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
import { expect, test, type Locator } from "@playwright/test";
import { questionCard } from "./helpers/question-card-test-helper.ts";
import { signInAs } from "./helpers/sign-in-as-test-helper.ts";

// The blur behind the panel, and how solid its own background colour is, from 0 to 1.
function blurAndBackgroundOpacity(panel: Locator) {
  return panel.evaluate((element) => {
    const style = getComputedStyle(element);
    // A canvas reads any colour syntax the browser does, so the opacity comes out as one number.
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!canvas) throw new Error("This browser has no canvas to read a colour with.");
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = style.backgroundColor;
    canvas.fillRect(0, 0, 1, 1);
    return {
      blur: style.backdropFilter,
      backgroundOpacity: (canvas.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255,
    };
  });
}

test("a card, a menu and the sidebar are frosted glass, and solid when the device asks for less see-through", async ({
  page,
}) => {
  await signInAs(page, "reader@iqb.test", "reader-password");
  await page.goto("/questions");
  const card = questionCard(page);
  await expect(card).toBeVisible();

  const glassCard = await blurAndBackgroundOpacity(card);
  expect(glassCard.blur).toMatch(/blur\(/);
  // See-through, but solid enough that long Answer Notes stay easy to read.
  expect(glassCard.backgroundOpacity).toBeGreaterThanOrEqual(0.7);
  expect(glassCard.backgroundOpacity).toBeLessThan(0.9);

  await page.getByRole("button", { name: "reader@iqb.test" }).click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  const glassMenu = await blurAndBackgroundOpacity(menu);
  expect(glassMenu.blur).toMatch(/blur\(/);
  expect(glassMenu.backgroundOpacity).toBeLessThan(1);
  await page.keyboard.press("Escape");

  const sidebar = page.locator('[data-slot="sidebar-inner"]');
  await expect(sidebar.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  const glassSidebar = await blurAndBackgroundOpacity(sidebar);
  expect(glassSidebar.blur).toMatch(/blur\(/);
  expect(glassSidebar.backgroundOpacity).toBeLessThan(1);

  // Playwright has no option for this setting, but Chromium's own DevTools protocol does.
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });

  const solidCard = await blurAndBackgroundOpacity(card);
  expect(solidCard.blur).toBe("none");
  expect(solidCard.backgroundOpacity).toBe(1);
  const solidSidebar = await blurAndBackgroundOpacity(sidebar);
  expect(solidSidebar.blur).toBe("none");
  expect(solidSidebar.backgroundOpacity).toBe(1);
});
