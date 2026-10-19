import { PlusIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/shadcn/dialog";

type AddDialogProps = {
  title: string;
  description: ReactNode;
  /** The form, handed the way to close the dialog once it is done or cancelled. */
  form: (close: () => void) => ReactNode;
  /** The page, which places an `AddDialogButton` wherever it offers the form. */
  children: ReactNode;
};

/** Wraps the whole page, so the form stays open and keeps what was typed when the page
 * moves its button, as it does into a list that comes back empty. */
export function AddDialog({ title, description, form, children }: AddDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

/** A page's main button, which opens the form so it is not always open on the page. */
export function AddDialogButton({ label }: { label: string }) {
  return (
    <DialogTrigger asChild>
      <Button>
        <PlusIcon aria-hidden="true" />
        {label}
      </Button>
    </DialogTrigger>
  );
}
