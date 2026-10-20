import { vi } from "vitest";

/** A test helper setting the clock. Only the date is faked, so the screen's own timers still
 * run. Undo it with `vi.useRealTimers()`. */
export function itIsNow(at: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}
