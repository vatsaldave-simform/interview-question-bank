import { describe, expect, it } from "vitest";
import { agoWording, dateAndTimeWording, dateWording, dayWording } from "@/platform/when-wording";

// Built from the local clock, so the expected words hold in any time zone the tests run in.
const at = (year: number, month: number, day: number, hours = 9, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes).toISOString();

describe("a date", () => {
  it("reads as month, day and year", () => {
    expect(dateWording(at(2026, 9, 1))).toBe("Sep 1, 2026");
  });

  it("reads with its time on a twelve-hour clock when the time matters", () => {
    expect(dateAndTimeWording(at(2026, 9, 2, 14, 30))).toBe("Sep 2, 2026, 2:30 PM");
  });

  it("reads as the day of the week, the month and the day when it is today", () => {
    expect(dayWording(new Date(at(2026, 10, 20)))).toBe("Tuesday, October 20");
  });
});

describe("how long ago something happened", () => {
  const now = new Date(at(2026, 10, 20, 12, 0));

  it("counts a day", () => {
    expect(agoWording(at(2026, 10, 19, 12, 0), now)).toBe("1 day ago");
    expect(agoWording(at(2026, 10, 18, 12, 0), now)).toBe("2 days ago");
  });

  it("counts in weeks from seven days on", () => {
    expect(agoWording(at(2026, 10, 14, 12, 0), now)).toBe("6 days ago");
    expect(agoWording(at(2026, 10, 13, 12, 0), now)).toBe("1 week ago");
    expect(agoWording(at(2026, 9, 21, 12, 0), now)).toBe("4 weeks ago");
  });

  it("counts in months from thirty days on, never saying 'about'", () => {
    expect(agoWording(at(2026, 9, 20, 12, 0), now)).toBe("1 month ago");
    expect(agoWording(at(2026, 7, 20, 12, 0), now)).toBe("3 months ago");
  });

  it("says 'just now' for under a minute", () => {
    expect(agoWording(at(2026, 10, 20, 11, 59), now)).toBe("1 minute ago");
    expect(agoWording(new Date(now.getTime() - 30_000).toISOString(), now)).toBe("just now");
  });
});
