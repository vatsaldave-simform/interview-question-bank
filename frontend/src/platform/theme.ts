export type ThemeChoice = "light" | "dark" | "device";

/** The script in `index.html` reads the same key, so the two must change together. */
const storageKey = "theme";

const darkDevice = () => window.matchMedia("(prefers-color-scheme: dark)");

// Held here as well as saved, so a choice still counts on this page when saving fails.
let choice: ThemeChoice | undefined;

function savedChoice(): ThemeChoice {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    // A browser that blocks site data throws here, and the device decides instead.
  }
  return saved === "light" || saved === "dark" ? saved : "device";
}

function applyTheme(): void {
  choice ??= savedChoice();
  const dark = choice === "dark" || (choice === "device" && darkDevice().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Once per page load. */
export function startFollowingTheme(): void {
  applyTheme();
  darkDevice().addEventListener("change", applyTheme);
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
}
