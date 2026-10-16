import { useSyncExternalStore } from "react";

/** In this browser's storage, never a cookie, for the reason on `useShortcutWithoutCookie`. */
const storageKey = "sidebar";

// Set once saving fails, so shrinking still works on this page when storage is blocked.
let heldHereOnly: boolean | undefined;
const watchers = new Set<() => void>();

function sidebarShrunk(): boolean {
  if (heldHereOnly !== undefined) return heldHereOnly;
  try {
    return window.localStorage.getItem(storageKey) === "shrunk";
  } catch {
    // A browser that blocks site data throws here, and the sidebar starts out wide.
    return false;
  }
}

/** Only this writes to storage, so a Viewer who never shrinks it leaves nothing behind. */
export function chooseSidebarShrunk(shrunk: boolean): void {
  try {
    if (shrunk) window.localStorage.setItem(storageKey, "shrunk");
    else window.localStorage.removeItem(storageKey);
    heldHereOnly = undefined;
  } catch {
    // Blocked storage: the choice lasts until this page is closed.
    heldHereOnly = shrunk;
  }
  for (const watcher of watchers) watcher();
}

function watch(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

export function useSidebarShrunk(): boolean {
  return useSyncExternalStore(watch, sidebarShrunk);
}
