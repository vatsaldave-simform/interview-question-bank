import { vi } from "vitest";

/** A test helper setting the clock, faking only the date so the screen's own timers still run. */
export function itIsNow(at: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}
