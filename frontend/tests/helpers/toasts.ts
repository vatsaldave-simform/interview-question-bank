import { screen, within } from "@testing-library/react";
import { expect } from "vitest";

/** A test helper listing the toasts on screen. Sonner marks each one with this attribute. */
export function toastsShown(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-sonner-toast]")];
}

/** A test helper finding the toast that says `text`, and failing if it shows more than once. */
export async function theToastSaying(text: string | RegExp): Promise<HTMLElement> {
  const toasts = within(await screen.findByRole("region", { name: /Notifications/ }));
  const toast = await toasts.findByText(text);
  expect(toasts.getAllByText(text)).toHaveLength(1);
  return toast;
}
