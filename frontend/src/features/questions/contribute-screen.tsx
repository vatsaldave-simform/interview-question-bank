import {
  addQuestionRequestSchema,
  type AddQuestionRequest,
  type NearDuplicate,
  type Question,
} from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { NearDuplicateDialog, nearDuplicatesIn } from "@/features/questions/near-duplicate-dialog";
import { QuestionForm } from "@/features/questions/question-form";
import {
  problemsIn,
  refusalOf,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useAddQuestion } from "@/features/questions/questions.queries";

const emptyDraft: QuestionDraft = { text: "", answerNotes: "", tags: [] };

/** A submission detection refused, kept as it was sent so the Author can send it again. */
type HeldBack = { request: AddQuestionRequest; message: string; nearDuplicates: NearDuplicate[] };

/** Checks the draft with the schema the API uses, so what it refuses here the API would
 * have refused too, and anything the API still refuses is shown in the same places. */
export function ContributeScreen({ onAdded }: { onAdded: (question: Question) => void }) {
  const add = useAddQuestion();
  const [problems, setProblems] = useState<DraftProblems>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [heldBack, setHeldBack] = useState<HeldBack | null>(null);

  function send(request: AddQuestionRequest): void {
    add.mutate(request, {
      onSuccess: ({ question }) => onAdded(question),
      onError: (reason) => {
        const nearDuplicates = nearDuplicatesIn(reason);
        if (nearDuplicates !== null) {
          setHeldBack({ request, message: reason.message, nearDuplicates });
          return;
        }
        const refused = refusalOf(reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
      },
    });
  }

  function submit(draft: QuestionDraft): void {
    // Provenance cannot be chosen on this form yet, and a Question typed in fresh is its
    // Author's own.
    const checked = addQuestionRequestSchema.safeParse({ ...draft, provenance: "original" });
    setRefusal(null);
    if (!checked.success) {
      setProblems(problemsIn(checked.error.issues));
      return;
    }

    setProblems({});
    send(checked.data);
  }

  function submitAnyway(held: HeldBack): void {
    setHeldBack(null);
    send({ ...held.request, confirmedNotANearDuplicate: true });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link to="/" className="text-muted-foreground text-sm hover:underline">
        ← All Questions
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add a Question</h1>
        <p className="text-muted-foreground text-sm">
          A Reviewer reads it before it is in the bank.
        </p>
      </div>
      <QuestionForm
        initial={emptyDraft}
        problems={problems}
        refusal={
          refusal === null ? null : { title: "The Question was not added", message: refusal }
        }
        sending={add.isPending}
        submit={{ label: "Add the Question", sendingLabel: "Adding…" }}
        onSubmit={submit}
      />
      {heldBack !== null && (
        <NearDuplicateDialog
          message={heldBack.message}
          nearDuplicates={heldBack.nearDuplicates}
          onChangeIt={() => setHeldBack(null)}
          onSubmitAnyway={() => submitAnyway(heldBack)}
        />
      )}
    </div>
  );
}
