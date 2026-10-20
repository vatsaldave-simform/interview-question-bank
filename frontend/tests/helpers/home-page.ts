import { screen } from "@testing-library/react";

/** A test helper matching Home's title, which is one of three greetings picked by the hour. */
export const homeGreeting = /^Good (morning|afternoon|evening)$/;

/** A test helper finding Home by its title, so no test depends on the hour it runs at. */
export async function findHome(): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 1, name: homeGreeting });
}
