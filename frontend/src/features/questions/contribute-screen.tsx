import {
  addQuestionRequestSchema,
  type AddQuestionRequest,
  type NearDuplicate,
  type Question,
} from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ContributeProvenanceFields,
  type ProvenanceChoice,
} from "@/features/questions/contribute-provenance-fields";
import { NearDuplicateDialog, nearDuplicatesIn } from "@/features/questions/near-duplicate-dialog";
import { QuestionClientChoice } from "@/features/questions/question-client-choice";
import { QuestionForm } from "@/features/questions/question-form";
import {
  checkRefused,
  refusalOf,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useAddQuestion } from "@/features/questions/questions.queries";
import { ScreenSection } from "@/features/questions/screen-section";
import { PageHeader } from "@/ui/page-header";
import { FieldGroup } from "@/ui/shadcn/field";

const emptyDraft: QuestionDraft = { text: "", answerNotes: "", tags: [] };

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
  const [clientId, setClientId] = useState<string | null>(null);
  const [problems, setProblems] = useState<DraftProblems>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refusedAsNearDuplicate, setRefusedAsNearDuplicate] =
    useState<RefusedAsNearDuplicate | null>(null);

  function send(request: AddQuestionRequest): void {
    add.mutate(request, {
      onSuccess: ({ question }) => onAdded(question),
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

  function submit(draft: QuestionDraft): void {
    const checked = addQuestionRequestSchema.safeParse({
      ...draft,
      ...provenanceIn(provenanceChoice),
      ...(clientId === null ? {} : { clientId }),
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link to="/" className="text-primary text-sm hover:underline">
        ← All Questions
      </Link>
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
        submit={{ label: "Add the Question", sendingLabel: "Adding…" }}
        onSubmit={submit}
      >
        <ScreenSection id="where-it-came-from" title="Where it came from and who can see it">
          <FieldGroup>
            <ContributeProvenanceFields
              choice={provenanceChoice}
              problems={problems}
              onChange={setProvenanceChoice}
            />
            <QuestionClientChoice clientId={clientId} onChange={setClientId} />
          </FieldGroup>
        </ScreenSection>
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
