import type { NearDuplicate, Question } from "@iqb/shared";
import { useState, type ComponentProps } from "react";
import { NearDuplicateDialog, nearDuplicatesIn } from "@/features/questions/near-duplicate-dialog";
import { useMoveQuestion, type PublicationMove } from "@/features/questions/questions.queries";
import { ReasonForm } from "@/features/questions/reason-form";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/shadcn/dialog";

/** Names the Question by its text, because its card may have left the list by the time the
 * refusal shows. */
export type ActRefused = { text: string; notDone: string; message: string };

const notDoneFor: Record<PublicationMove["act"], string> = {
  publish: "was not Published",
  reject: "was not Rejected",
  return: "was not returned",
  resubmit: "was not resubmitted",
};

function refusedAs(act: PublicationMove["act"], question: Question, message: string): ActRefused {
  return { text: question.text, notDone: notDoneFor[act], message };
}

export type ActProps = {
  question: Question;
  /** Told the API's refusal, or null when a new act starts, for the screen to show, since a
   * Question that moved may leave the list that held this button. */
  onRefusal: (refused: ActRefused | null) => void;
};

/** For a list, where the refusal has to say which Question it is about. */
export function ActRefusedInList({ refused }: { refused: ActRefused }) {
  return <ActNotDone title={`"${refused.text}" ${refused.notDone}.`} reason={refused.message} />;
}

type RefusedAsNearDuplicate = { message: string; nearDuplicates: NearDuplicate[] };

export function PublishButton({ question, onRefusal }: ActProps) {
  const move = useMoveQuestion(question.id);
  const [refusedAsNearDuplicate, setRefusedAsNearDuplicate] =
    useState<RefusedAsNearDuplicate | null>(null);

  function publish(confirmedNotANearDuplicate: boolean): void {
    onRefusal(null);
    setRefusedAsNearDuplicate(null);
    // Not `mutate`'s own callback, which is dropped once the card has left the list.
    move
      .mutateAsync({ act: "publish", request: { confirmedNotANearDuplicate } })
      .catch((reason: Error) => {
        const nearDuplicates = nearDuplicatesIn(reason);
        if (nearDuplicates !== null) {
          setRefusedAsNearDuplicate({ message: reason.message, nearDuplicates });
          return;
        }
        onRefusal(refusedAs("publish", question, whatWentWrong(reason)));
      });
  }

  return (
    <>
      <Button size="sm" disabled={move.isPending} onClick={() => publish(false)}>
        Publish
      </Button>
      {refusedAsNearDuplicate !== null && (
        <NearDuplicateDialog
          message={refusedAsNearDuplicate.message}
          nearDuplicates={refusedAsNearDuplicate.nearDuplicates}
          cancelLabel="Leave it Pending"
          submitAnywayLabel="It is different, Publish it"
          onCancel={() => setRefusedAsNearDuplicate(null)}
          onSubmitAnyway={() => publish(true)}
        />
      )}
    </>
  );
}

/** Its own act, because an edit alone leaves a Rejected Question where it is (ADR-0013). */
export function ResubmitButton({ question, onRefusal }: ActProps) {
  const move = useMoveQuestion(question.id);

  function resubmit(): void {
    onRefusal(null);
    move
      .mutateAsync({ act: "resubmit" })
      .catch((reason: Error) =>
        onRefusal(refusedAs("resubmit", question, whatWentWrong(reason))),
      );
  }

  return (
    <Button size="sm" disabled={move.isPending} onClick={resubmit}>
      Resubmit
    </Button>
  );
}

const reasonActWording = {
  reject: {
    open: "Reject",
    title: "Reject the Question",
    label: "Why it is Rejected",
    send: "Send the rejection",
  },
  return: {
    open: "Return to its Author",
    title: "Return it to its Author",
    label: "Why it is returned",
    send: "Return it",
  },
};

type ReasonActProps = ActProps & {
  act: keyof typeof reasonActWording;
  variant?: ComponentProps<typeof Button>["variant"];
};

/** A button that opens a reason box, since the act is refused without one. */
export function ReasonAct({ act, question, onRefusal, variant = "outline" }: ReasonActProps) {
  const move = useMoveQuestion(question.id);
  const [writing, setWriting] = useState(false);
  const wording = reasonActWording[act];

  return (
    <Dialog open={writing} onOpenChange={setWriting}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          {wording.open}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{wording.title}</DialogTitle>
          <DialogDescription className="flex flex-col gap-2">
            <span className="text-foreground">{question.text}</span>
            <span>Its Author is shown the reason you give.</span>
          </DialogDescription>
        </DialogHeader>
        <ReasonForm
          fieldId={`${act}-reason-${question.id}`}
          label={wording.label}
          sendLabel={wording.send}
          sending={move.isPending}
          onSend={(request) => {
            onRefusal(null);
            return move.mutateAsync({ act, request }).then(() => setWriting(false));
          }}
          onRefusal={(message) => {
            onRefusal(refusedAs(act, question, message));
            // Closed, so the refusal the screen shows is not hidden behind the dialog.
            setWriting(false);
          }}
          onCancel={() => setWriting(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
