import { expect, type Page } from "@playwright/test";

/** Signs in with a seeded account and waits until the signed-in frame is up. */
export async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: email })).toBeVisible();
}
