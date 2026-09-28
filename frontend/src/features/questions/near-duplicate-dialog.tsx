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

export function nearDuplicatesIn(reason: Error): NearDuplicate[] | null {
  if (!(reason instanceof ApiFailure) || reason.code !== "conflict") return null;
  const found = nearDuplicatesFoundSchema.safeParse(reason.details);
  return found.success ? found.data.nearDuplicates : null;
}

type NearDuplicateDialogProps = {
  /** The API's own words for why it refused, shown as it sent them. */
  message: string;
  nearDuplicates: readonly NearDuplicate[];
  /** What going back does, in the button's words: changing the text, or leaving it Pending. */
  cancelLabel: string;
  /** What sending it anyway does, in the button's words: adding it, saving an edit, or
   * Publishing it. */
  submitAnywayLabel: string;
  onCancel: () => void;
  onSubmitAnyway: () => void;
};

/** Only the Viewer acting may overrule detection, whether they wrote the text or are
 * Publishing it, so the client offers the choice and never makes it (ADR-0014). */
export function NearDuplicateDialog(props: NearDuplicateDialogProps) {
  const { message, nearDuplicates, cancelLabel, submitAnywayLabel, onCancel, onSubmitAnyway } =
    props;
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This may already be in the bank</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {nearDuplicates.map(({ questionId, text, similarity }) => (
            <li key={questionId} className="flex flex-col gap-0.5 text-sm">
              {/* A new tab, so reading a Near-Duplicate loses nothing on this screen. */}
              <Link
                to="/questions/$questionId"
                params={{ questionId }}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-primary hover:underline"
              >
                {text}
              </Link>
              <span className="text-muted-foreground">{Math.round(similarity * 100)}% alike</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onSubmitAnyway}>{submitAnywayLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
