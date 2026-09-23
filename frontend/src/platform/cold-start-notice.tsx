import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";

/**
 * The deployed service sleeps after fifteen minutes and takes about a minute to wake
 * (ADR-0012). Saying so is the difference between a visitor reading the wait as slow and
 * reading it as broken.
 */
export function ColdStartNotice() {
  return (
    <Alert>
      <AlertTitle>The first visit of the day is slow</AlertTitle>
      <AlertDescription>
        Hosted on a free tier that sleeps when idle. The first visit after a quiet spell
        takes about a minute to wake; later ones are immediate.
      </AlertDescription>
    </Alert>
  );
}
