import { expect, test } from "@playwright/test";

test("the client reaches the API", async ({ page }) => {
  await page.goto("/");

  // The login form appears only after the client has asked the API for a session and been
  // told there is none.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
