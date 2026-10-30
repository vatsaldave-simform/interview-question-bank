import {
  addQuestionRequestSchema,
  type AddQuestionRequest,
  type NearDuplicate,
  type Question,
} from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ContributeProvenanceFields,
  type ProvenanceChoice,
} from "@/features/questions/contribute-provenance-fields";
import { NearDuplicateDialog, nearDuplicatesIn } from "@/features/questions/near-duplicate-dialog";
import { QuestionForm } from "@/features/questions/question-form";
import {
  checkRefused,
  refusalOf,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useAddQuestion } from "@/features/questions/questions.queries";
import { PageHeader } from "@/ui/page-header";
import { Button } from "@/ui/shadcn/button";

const emptyDraft: QuestionDraft = { text: "", answerNotes: "", tags: [], clientIds: [] };

/** A Source belongs only to an Adapted Question, and a blank one names nothing. */
function provenanceIn({ provenance, source }: ProvenanceChoice) {
  return {
    ...(provenance === null ? {} : { provenance }),
    ...(provenance === "adapted" && source.trim() !== "" ? { source } : {}),
  };
}

/** Kept as it was sent, so that confirming sends the same Question again. */
type RefusedAsNearDuplicate = {
  request: AddQuestionRequest;
  message: string;
  nearDuplicates: NearDuplicate[];
};

/** Checks the draft with the schema the API uses, so what it refuses here the API would
 * have refused too, and anything the API still refuses is shown in the same places. */
export function ContributeScreen({ onAdded }: { onAdded: (question: Question) => void }) {
  const add = useAddQuestion();
  const [provenanceChoice, setProvenanceChoice] = useState<ProvenanceChoice>({
    provenance: null,
    source: "",
  });
  const [problems, setProblems] = useState<DraftProblems>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refusedAsNearDuplicate, setRefusedAsNearDuplicate] =
    useState<RefusedAsNearDuplicate | null>(null);

  function send(request: AddQuestionRequest): void {
    add.mutate(request, {
      onSuccess: ({ question }) => {
        toast.success("The Question was added.");
        onAdded(question);
      },
      onError: (reason) => {
        const nearDuplicates = nearDuplicatesIn(reason);
        if (nearDuplicates !== null) {
          setRefusedAsNearDuplicate({ request, message: reason.message, nearDuplicates });
          return;
        }
        const refused = refusalOf(reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
      },
    });
  }

  function submit({ clientIds, ...draft }: QuestionDraft): void {
    const checked = addQuestionRequestSchema.safeParse({
      ...draft,
      ...(clientIds.length === 0 ? {} : { clientIds }),
      ...provenanceIn(provenanceChoice),
    });
    if (!checked.success) {
      // The message is for a field this form does not show, which only a page out of date
      // can get wrong.
      const refused = checkRefused(
        checked.error.issues,
        "This page could not check the Question. Reload it and try again.",
      );
      setProblems(refused.problems);
      setRefusal(refused.message);
      return;
    }

    setProblems({});
    setRefusal(null);
    send(checked.data);
  }

  function submitAnyway(refused: RefusedAsNearDuplicate): void {
    setRefusedAsNearDuplicate(null);
    send({ ...refused.request, confirmedNotANearDuplicate: true });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-section">
      <PageHeader
        title="Add a Question"
        description="A Reviewer reads it before it is in the bank."
      />
      <QuestionForm
        initial={emptyDraft}
        problems={problems}
        refusal={
          refusal === null ? null : { title: "The Question was not added", message: refusal }
        }
        sending={add.isPending}
        submit={{ label: "Send for review", sendingLabel: "Sending…" }}
        cancel={
          <Button variant="outline" asChild>
            <Link to="/">Cancel</Link>
          </Button>
        }
        onSubmit={submit}
      >
        <ContributeProvenanceFields
          choice={provenanceChoice}
          problems={problems}
          onChange={setProvenanceChoice}
        />
      </QuestionForm>
      {refusedAsNearDuplicate !== null && (
        <NearDuplicateDialog
          message={refusedAsNearDuplicate.message}
          nearDuplicates={refusedAsNearDuplicate.nearDuplicates}
          cancelLabel="Change my Question"
          submitAnywayLabel="It is different, add it"
          onCancel={() => setRefusedAsNearDuplicate(null)}
          onSubmitAnyway={() => submitAnyway(refusedAsNearDuplicate)}
        />
      )}
    </div>
  );
}
