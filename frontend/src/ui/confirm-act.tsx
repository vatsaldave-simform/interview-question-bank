import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/shadcn/alert-dialog";

type ConfirmActProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What happens, in one sentence, so nobody has to guess before they press. */
  description: ReactNode;
  /** The act's own name, on the red button, like "Deactivate". */
  act: string;
  onConfirm: () => void;
};

/** Asked before an act that is hard to undo, and only the red button carries it out. */
export function ConfirmAct(props: ConfirmActProps) {
  const { open, onOpenChange, title, description, act, onConfirm } = props;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {act}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
