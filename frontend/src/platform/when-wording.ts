import { differenceInDays, differenceInSeconds, format, formatDistanceStrict } from "date-fns";

/** "Sep 1, 2026" */
export function dateWording(at: string): string {
  return format(at, "MMM d, yyyy");
}

/** "Sep 1, 2026, 2:30 PM" */
export function dateAndTimeWording(at: string): string {
  return format(at, "MMM d, yyyy, h:mm a");
}

/** "2 days ago" */
export function agoWording(at: string, now: Date = new Date()): string {
  // Also catches a moment a little ahead of this device's clock, which would read "in 5 seconds".
  if (differenceInSeconds(now, at) < 60) return "just now";
  const days = differenceInDays(now, at);
  // date-fns goes straight from days to months at 30 days, and "3 weeks ago" reads better.
  if (days >= 7 && days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  return formatDistanceStrict(at, now, { addSuffix: true });
}
