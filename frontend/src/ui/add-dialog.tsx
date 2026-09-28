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
  label: string;
  title: string;
  description: ReactNode;
  /** Told when the dialog opens, so a message about the last one added can go. */
  onOpen: () => void;
  /** The form, handed the way to close the dialog once it is done or cancelled. */
  children: (close: () => void) => ReactNode;
};

/** A page's main button that opens a form, so the form is not always open on the page. */
export function AddDialog({ label, title, description, onOpen, children }: AddDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(opening) => {
        setOpen(opening);
        if (opening) onOpen();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}
