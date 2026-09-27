import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";

type ActNotDoneProps = {
  /** What did not happen, as in "The Viewer was not created." */
  title: string;
  reason: string;
};

export function ActNotDone({ title, reason }: ActNotDoneProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
}
