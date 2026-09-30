import { afterEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../index.html?raw";
import { aDevice } from "./helpers/fake-device";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fresh page load, so nothing the last test chose is still held in memory. */
async function loadThePage() {
  vi.resetModules();
  const theme = await import("@/platform/theme");
  theme.startFollowingTheme();
  return theme;
}

/** The script `index.html` runs before the page is drawn, run as the browser would. */
function runTheScriptInIndexHtml() {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1];
  if (!script) throw new Error("index.html has no inline script");
  new Function(script)();
}

/** What a browser set to block site data does when a page touches storage. */
function storageIsBlocked() {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(refuse);
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

// Both run on every load, one before the page is drawn and one after, so a rule they
// disagree on would flip the page from one theme to the other.
describe.each([
  ["the script in index.html", runTheScriptInIndexHtml],
  ["theme.ts", loadThePage],
])("on load, %s", (_name, load) => {
  it("follows a dark device when nothing is saved", async () => {
    aDevice({ dark: true });
    await load();
    expect(isDark()).toBe(true);
  });

  it("follows a light device when nothing is saved", async () => {
    aDevice({ dark: false });
    await load();
    expect(isDark()).toBe(false);
  });

  it("takes a saved Dark over a light device", async () => {
    aDevice({ dark: false });
    window.localStorage.setItem("theme", "dark");
    await load();
    expect(isDark()).toBe(true);
  });

  it("takes a saved Light over a dark device", async () => {
    aDevice({ dark: true });
    window.localStorage.setItem("theme", "light");
    await load();
    expect(isDark()).toBe(false);
  });

  it("follows the device when the browser blocks storage", async () => {
    aDevice({ dark: true });
    storageIsBlocked();
    await load();
    expect(isDark()).toBe(true);
  });
});

describe("after load", () => {
  it("follows the device as it changes, when nothing is saved", async () => {
    const device = aDevice({ dark: false });
    await loadThePage();

    device.setDark(true);
    expect(isDark()).toBe(true);
    device.setDark(false);
    expect(isDark()).toBe(false);
  });

  it("keeps a saved Dark when the device turns light", async () => {
    const device = aDevice({ dark: true });
    window.localStorage.setItem("theme", "dark");
    await loadThePage();

    device.setDark(false);
    expect(isDark()).toBe(true);
  });
});

describe("choosing a theme", () => {
  it("turns the page dark at once, and a reload keeps it", async () => {
    aDevice({ dark: false });
    const theme = await loadThePage();

    theme.chooseTheme("dark");
    expect(isDark()).toBe(true);

    await loadThePage();
    expect(isDark()).toBe(true);
  });

  it("goes back to following the device on Match my device, and a reload keeps that", async () => {
    const device = aDevice({ dark: false });
    window.localStorage.setItem("theme", "dark");
    const theme = await loadThePage();

    theme.chooseTheme("device");
    expect(isDark()).toBe(false);
    device.setDark(true);
    expect(isDark()).toBe(true);

    device.setDark(false);
    await loadThePage();
    expect(isDark()).toBe(false);
  });

  it("still changes this page when the browser blocks storage", async () => {
    aDevice({ dark: false });
    storageIsBlocked();
    const theme = await loadThePage();

    theme.chooseTheme("dark");
    expect(isDark()).toBe(true);
  });
});
