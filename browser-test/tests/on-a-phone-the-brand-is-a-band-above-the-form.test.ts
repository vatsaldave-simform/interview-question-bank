// The code handed to `page.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from "@playwright/test";

const phone = { width: 390, height: 844 };

function bottomOf(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().bottom);
}

function topOf(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().top);
}

test.use({ viewport: phone });

// Set password without a token is the shortest signed-out screen, which is where a band
// that stretched to fill the spare height would push the form down.
const screens: [string, string, (page: Page) => Locator][] = [
  ["/login", "Sign in", (page) => page.getByRole("button", { name: "Sign in" })],
  [
    "/forgotten-password",
    "Forgotten your password?",
    (page) => page.getByRole("button", { name: "Email me a link" }),
  ],
  ["/set-password", "Set your password", (page) => page.getByRole("link", { name: "Ask for a new link" })],
];

for (const [address, title, mainControl] of screens) {
  test(`on a phone, ${address} shows the brand as a band above a form that fits`, async ({
    page,
  }) => {
    await page.goto(address);
    const brandLine = page.getByRole("heading", { level: 1 });
    const formTitle = page.getByRole("heading", { level: 2, name: title });
    await expect(formTitle).toBeVisible();

    expect(await bottomOf(brandLine)).toBeLessThanOrEqual(await topOf(formTitle));
    // A band taller than this would start a short form halfway down the screen.
    expect(await topOf(formTitle)).toBeLessThan(phone.height * 0.4);
    await expect(mainControl(page)).toBeInViewport({ ratio: 1 });
    const widths = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      screen: window.innerWidth,
    }));
    expect(widths.page).toBeLessThanOrEqual(widths.screen);
  });
}
