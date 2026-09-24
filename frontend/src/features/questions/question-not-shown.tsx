import { ApiFailure, whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";

type QuestionNotShownProps = { reason: Error; onRetry: () => void };

export function QuestionNotShown({ reason, onRetry }: QuestionNotShownProps) {
  // One wording for "no such Question" and "one you cannot see", because the API gives
  // one answer for both and anything more would be the client guessing (ADR-0002).
  if (reason instanceof ApiFailure && reason.code === "not_found") {
    return (
      <Alert>
        <AlertTitle>Question not found</AlertTitle>
        <AlertDescription>
          <p>There is no Question at this address that you can see.</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>The Question could not be loaded</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{whatWentWrong(reason)}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
