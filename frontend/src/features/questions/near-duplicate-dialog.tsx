import { nearDuplicatesFoundSchema, type NearDuplicate } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { ApiFailure } from "@/platform/api-client";
import { Button } from "@/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/shadcn/dialog";

/** What the API judged a refused Question too close to, or null when that is not why it
 * was refused. */
export function nearDuplicatesIn(reason: Error): NearDuplicate[] | null {
  if (!(reason instanceof ApiFailure) || reason.code !== "conflict") return null;
  const found = nearDuplicatesFoundSchema.safeParse(reason.details);
  return found.success ? found.data.nearDuplicates : null;
}

type NearDuplicateDialogProps = {
  /** The API's own words for why it refused, shown as it sent them. */
  message: string;
  nearDuplicates: readonly NearDuplicate[];
  onChangeIt: () => void;
  onSubmitAnyway: () => void;
};

/** Only the Author can say a match is wrong, so the client offers the choice and never
 * makes it (ADR-0014). */
export function NearDuplicateDialog(props: NearDuplicateDialogProps) {
  const { message, nearDuplicates, onChangeIt, onSubmitAnyway } = props;
  return (
    <Dialog open onOpenChange={(open) => !open && onChangeIt()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This may already be in the bank</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {nearDuplicates.map(({ questionId, text, similarity }) => (
            <li key={questionId} className="flex flex-col gap-0.5 text-sm">
              {/* A new tab, so reading the match does not throw away the form. */}
              <Link
                to="/questions/$questionId"
                params={{ questionId }}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {text}
              </Link>
              <span className="text-muted-foreground">{Math.round(similarity * 100)}% alike</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onChangeIt}>
            Change my Question
          </Button>
          <Button onClick={onSubmitAnyway}>It is different, add it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
