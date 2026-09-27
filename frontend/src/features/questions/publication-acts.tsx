import type { NearDuplicate, Question } from "@iqb/shared";
import { useState } from "react";
import { NearDuplicateDialog, nearDuplicatesIn } from "@/features/questions/near-duplicate-dialog";
import { useMoveQuestion } from "@/features/questions/questions.queries";
import { ReasonForm } from "@/features/questions/reason-form";
import { whatWentWrong } from "@/platform/api-client";
import { Button } from "@/ui/shadcn/button";

/** What did not happen, as in "was not Published", and the API's words for why. */
export type ActRefused = { notDone: string; message: string };

type ActProps = {
  question: Question;
  /** Told the API's refusal, or null when a new act starts. The screen shows it, because a
   * Question that moved may leave the list that held this button. */
  onRefusal: (refused: ActRefused | null) => void;
};

type RefusedAsNearDuplicate = { message: string; nearDuplicates: NearDuplicate[] };

export function PublishButton({ question, onRefusal }: ActProps) {
  const move = useMoveQuestion(question.id);
  const [refusedAsNearDuplicate, setRefusedAsNearDuplicate] =
    useState<RefusedAsNearDuplicate | null>(null);

  function publish(confirmedNotANearDuplicate: boolean): void {
    onRefusal(null);
    setRefusedAsNearDuplicate(null);
    move.mutate(
      { act: "publish", request: { confirmedNotANearDuplicate } },
      {
        onError: (reason) => {
          const nearDuplicates = nearDuplicatesIn(reason);
          if (nearDuplicates !== null) {
            setRefusedAsNearDuplicate({ message: reason.message, nearDuplicates });
            return;
          }
          onRefusal({ notDone: "was not Published", message: whatWentWrong(reason) });
        },
      },
    );
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
          submitAnywayLabel="It is different, publish it"
          onCancel={() => setRefusedAsNearDuplicate(null)}
          onSubmitAnyway={() => publish(true)}
        />
      )}
    </>
  );
}

const reasonActWording = {
  reject: {
    open: "Reject",
    label: "Why it is Rejected",
    send: "Send the rejection",
    notDone: "was not Rejected",
  },
};

type ReasonActProps = ActProps & { act: keyof typeof reasonActWording };

/** A button that opens a reason box, since the act is refused without one. */
export function ReasonAct({ act, question, onRefusal }: ReasonActProps) {
  const move = useMoveQuestion(question.id);
  const [writing, setWriting] = useState(false);
  const wording = reasonActWording[act];

  if (!writing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
        {wording.open}
      </Button>
    );
  }
  return (
    <ReasonForm
      fieldId={`${act}-reason-${question.id}`}
      label={wording.label}
      sendLabel={wording.send}
      sending={move.isPending}
      onSend={(request) => {
        onRefusal(null);
        return move.mutateAsync({ act, request });
      }}
      onRefusal={(message) => onRefusal({ notDone: wording.notDone, message })}
      onCancel={() => {
        setWriting(false);
        onRefusal(null);
      }}
    />
  );
}
