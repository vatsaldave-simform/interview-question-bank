/**
 * The deployed service sleeps after fifteen minutes and takes about a minute to wake
 * (ADR-0012). Saying so is the difference between a visitor reading the wait as slow and
 * reading it as broken.
 */
export function ColdStartNotice() {
  return (
    <p className="text-muted-foreground text-center text-xs">
      The server sleeps when idle, so the first visit after a quiet spell takes about a minute
      to wake it.
    </p>
  );
}
