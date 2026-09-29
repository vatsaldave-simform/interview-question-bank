import { useSyncExternalStore } from "react";

export const themeChoices = ["light", "dark", "device"] as const;
export type ThemeChoice = (typeof themeChoices)[number];

/** The script in `index.html` reads the same key, so the two must change together. */
const storageKey = "theme";

const darkDeviceQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

// Held here as well as saved, so a choice still counts on this page when saving fails.
let choice: ThemeChoice | undefined;
const watchers = new Set<() => void>();

function savedChoice(): ThemeChoice {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    // A browser that blocks site data throws here, and the device decides instead.
  }
  return saved === "light" || saved === "dark" ? saved : "device";
}

function themeChoice(): ThemeChoice {
  return (choice ??= savedChoice());
}

function applyTheme(): void {
  const current = themeChoice();
  const dark = current === "dark" || (current === "device" && darkDeviceQuery().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** `main.tsx` calls this once, because each call adds another device listener. */
export function startFollowingTheme(): void {
  applyTheme();
  darkDeviceQuery().addEventListener("change", applyTheme);
}

/** Only this writes to storage, so a Viewer who never picks leaves nothing behind. */
export function chooseTheme(next: ThemeChoice): void {
  choice = next;
  try {
    if (next === "device") window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, next);
  } catch {
    // Blocked storage: the choice lasts until this page is closed.
  }
  applyTheme();
  for (const watcher of watchers) watcher();
}

function watch(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(watch, themeChoice);
}
