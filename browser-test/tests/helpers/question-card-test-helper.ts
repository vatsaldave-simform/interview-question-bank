import type { Locator, Page } from "@playwright/test";

/** A card with a Question's link, not one of the placeholder cards shown while the list loads. */
export function questionCard(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.getByRole("link") }).first();
}
