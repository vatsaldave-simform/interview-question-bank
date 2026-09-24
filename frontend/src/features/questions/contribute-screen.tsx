import { addQuestionRequestSchema, type Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { QuestionForm } from "@/features/questions/question-form";
import {
  problemsIn,
  refusalOf,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useAddQuestion } from "@/features/questions/questions.queries";

const emptyDraft: QuestionDraft = { text: "", answerNotes: "", tags: [] };

/** Checks the draft with the schema the API uses, so what it refuses here the API would
 * have refused too, and anything the API still refuses is shown in the same places. */
export function ContributeScreen({ onAdded }: { onAdded: (question: Question) => void }) {
  const add = useAddQuestion();
  const [problems, setProblems] = useState<DraftProblems>({});
  const [refusal, setRefusal] = useState<string | null>(null);

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
    add.mutate(checked.data, {
      onSuccess: ({ question }) => onAdded(question),
      onError: (reason) => {
        const refused = refusalOf(reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
      },
    });
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
    </div>
  );
}
