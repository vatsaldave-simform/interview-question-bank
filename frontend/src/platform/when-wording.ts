import { differenceInDays, differenceInSeconds, format, formatDistanceStrict } from "date-fns";

export function dateWording(at: string): string {
  return format(at, "MMM d, yyyy");
}

export function dateAndTimeWording(at: string): string {
  return format(at, "MMM d, yyyy, h:mm a");
}

export function dayWording(now: Date = new Date()): string {
  return format(now, "EEEE, MMMM d");
}

export function agoWording(at: string, now: Date = new Date()): string {
  // Also catches a moment a little ahead of this device's clock, which "ago" cannot say.
  if (differenceInSeconds(now, at) < 60) return "just now";
  return `${waitedWording(at, now)} ago`;
}

export function waitedWording(since: string, now: Date = new Date()): string {
  if (differenceInSeconds(now, since) < 60) return "under a minute";
  const days = differenceInDays(now, since);
  // date-fns goes straight from days to months at 30 days, and "3 weeks" reads better.
  if (days >= 7 && days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return formatDistanceStrict(since, now);
}
