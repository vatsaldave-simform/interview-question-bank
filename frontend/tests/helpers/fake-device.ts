import { vi } from "vitest";

/** A test helper standing in for the device's light or dark setting, which jsdom does not have. */
export function aDevice({ dark }: { dark: boolean }) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
  };
  // Any other question, such as the phone width the sidebar asks about, gets the light
  // stand-in's answer from `test-dom.ts`, so only the dark setting is under the test's control.
  const otherwise = window.matchMedia;
  vi.stubGlobal("matchMedia", (text: string) =>
    text === "(prefers-color-scheme: dark)" ? query : otherwise(text),
  );
  return {
    setDark(next: boolean) {
      dark = next;
      for (const listener of listeners) listener();
    },
  };
}
