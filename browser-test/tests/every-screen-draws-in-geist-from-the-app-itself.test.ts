// The code handed to `page.evaluate` runs in the browser, so this one file needs its types.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { expect, test } from "@playwright/test";

test("every screen draws in Geist from the app itself", async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL ?? "").origin;
  const otherHosts: string[] = [];
  const fontFiles: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== appOrigin) otherHosts.push(request.url());
    if (request.resourceType() === "font") fontFiles.push(request.url());
  });

  // The login screen needs no session, and it shares the one stylesheet with every screen.
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const fontInUse = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      // A font face is only fetched once some text on the page uses it.
      geistLoaded: [...document.fonts].some(
        (face) => face.family.replaceAll('"', "") === "Geist Variable" && face.status === "loaded",
      ),
    };
  });

  expect(fontInUse.bodyFont).toMatch(/^"?Geist Variable"?,/);
  expect(fontInUse.geistLoaded).toBe(true);
  expect(fontFiles.length).toBeGreaterThan(0);
  expect(otherHosts).toEqual([]);
});
