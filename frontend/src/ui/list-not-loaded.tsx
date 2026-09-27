import { ApiFailure, whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";

type ListNotLoadedProps = {
  /** What the list holds, as it reads in "The Viewers could not be loaded". */
  what: string;
  reason: Error;
  onRetry: () => void;
};

export function ListNotLoaded({ what, reason, onRetry }: ListNotLoadedProps) {
  // No Try again on a refusal, because asking a second time gets the same answer.
  if (reason instanceof ApiFailure && reason.code === "forbidden") {
    return (
      <Alert>
        {/* It names no reason, because only the API's own words say why (#20, story 52). */}
        <AlertTitle>The bank refused to show the {what}</AlertTitle>
        <AlertDescription>
          <p>{reason.message}</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>The {what} could not be loaded</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{whatWentWrong(reason)}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
