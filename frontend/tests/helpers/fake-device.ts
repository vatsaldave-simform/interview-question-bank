import { vi } from "vitest";

/** A test helper standing in for the device's light or dark setting, which jsdom does not
 * have. `setDark` changes it the way the device would, telling whoever listens. */
export function aDevice({ dark }: { dark: boolean }) {
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return dark;
    },
    addEventListener: (_type: "change", listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: "change", listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", (text: string) => {
    if (text !== "(prefers-color-scheme: dark)") throw new Error(`Unexpected query: ${text}`);
    return query;
  });
  return {
    setDark(next: boolean) {
      dark = next;
      for (const listener of listeners) listener();
    },
  };
}
