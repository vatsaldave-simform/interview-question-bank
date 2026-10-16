// The code handed to `locator.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
import { expect, test, type Locator } from "@playwright/test";
import { signInAs } from "./helpers/sign-in-as-test-helper.ts";

/** How the panel is painted: its blur, and how much of what is behind it shows through. */
function glassOf(panel: Locator) {
  return panel.evaluate((element) => {
    const style = getComputedStyle(element);
    // A canvas reads any colour syntax the browser does, so the cover comes out as one number.
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!canvas) throw new Error("This browser has no canvas to read a colour with.");
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = style.backgroundColor;
    canvas.fillRect(0, 0, 1, 1);
    return {
      blur: style.backdropFilter,
      cover: (canvas.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255,
    };
  });
}

test("a card and a menu are frosted glass, and solid when the device asks for less see-through", async ({
  page,
}) => {
  await signInAs(page, "reader@iqb.test", "reader-password");
  await page.goto("/questions");
  // A card with a Question's link, not one of the placeholder cards shown while the list loads.
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("link") }).first();
  await expect(card).toBeVisible();

  const glassCard = await glassOf(card);
  expect(glassCard.blur).toMatch(/blur\(/);
  // See-through, but solid enough that long Answer Notes stay easy to read.
  expect(glassCard.cover).toBeGreaterThanOrEqual(0.7);
  expect(glassCard.cover).toBeLessThan(0.9);

  await page.getByRole("button", { name: "reader@iqb.test" }).click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  const glassMenu = await glassOf(menu);
  expect(glassMenu.blur).toMatch(/blur\(/);
  expect(glassMenu.cover).toBeLessThan(1);
  await page.keyboard.press("Escape");

  // Playwright has no option for this setting, but Chromium's own DevTools protocol does.
  const devTools = await page.context().newCDPSession(page);
  await devTools.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });

  const solidCard = await glassOf(card);
  expect(solidCard.blur).toBe("none");
  expect(solidCard.cover).toBe(1);
});
