import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  PublishButton,
  ReasonAct,
  ResubmitButton,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { provenanceWording } from "@/features/questions/provenance-wording";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { QuestionHistory } from "@/features/questions/question-history";
import { QuestionNotShown } from "@/features/questions/question-not-shown";
import { QuestionTags } from "@/features/questions/question-tags";
import { useQuestion } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { ActNotDone } from "@/ui/act-not-done";
import { Badge } from "@/ui/shadcn/badge";
import { Button } from "@/ui/shadcn/button";

export function QuestionScreen({ questionId }: { questionId: string }) {
  const question = useQuestion(questionId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link to="/" className="text-muted-foreground text-sm hover:underline">
        ← All Questions
      </Link>
      {question.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading the Question…
        </p>
      ) : question.isError ? (
        <QuestionNotShown reason={question.error} onRetry={() => void question.refetch()} />
      ) : (
        <>
          <QuestionInFull question={question.data} />
          <QuestionHistory questionId={questionId} />
        </>
      )}
    </div>
  );
}

function QuestionInFull({ question }: { question: Question }) {
  const state = publicationStateWording[question.publicationState];
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl leading-snug font-semibold">{question.text}</h1>
        {/* Shown to every Viewer: whether this one may edit is the API's answer, and it
            gives it when they save (ADR-0002). */}
        <Button asChild variant="outline">
          <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
            Edit
          </Link>
        </Button>
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{state.name}</Badge>
        <span className="text-muted-foreground">{state.meaning}</span>
      </p>
      {question.reason !== null && <RejectionReason reason={question.reason} />}
      <PublicationActs question={question} />
      <section className="flex flex-col gap-2" aria-labelledby="answer-notes">
        <h2 id="answer-notes" className="font-medium">
          Answer Notes
        </h2>
        <p className="whitespace-pre-line">{question.answerNotes}</p>
      </section>
      <QuestionTags tags={question.tags} />
      <WhereItCameFrom question={question} />
    </article>
  );
}

function WhereItCameFrom({ question }: { question: Question }) {
  const { name, meaning } = provenanceWording[question.provenance];
  return (
    <section className="flex flex-col gap-2" aria-labelledby="where-it-came-from">
      <h2 id="where-it-came-from" className="font-medium">
        Where it came from
      </h2>
      <p>
        {name}. {meaning}
      </p>
      {question.provenance === "adapted" &&
        (question.source === null ? (
          <p className="text-muted-foreground">Its Author named no Source.</p>
        ) : (
          <p>
            Source: <cite>{question.source}</cite>
          </p>
        ))}
    </section>
  );
}

/** Offered by the Publication State alone, because whether this Viewer may act is the API's
 * answer, as it is for Edit (ADR-0002). */
function PublicationActs({ question }: { question: Question }) {
  const [refusal, setRefusal] = useState<ActRefused | null>(null);
  const { publicationState } = question;

  return (
    <div className="flex flex-col gap-3">
      {refusal !== null && (
        <ActNotDone title={`This Question ${refusal.notDone}.`} reason={refusal.message} />
      )}
      <div className="flex flex-wrap items-start gap-2">
        {publicationState === "pending" && (
          <>
            <PublishButton question={question} onRefusal={setRefusal} />
            <ReasonAct act="reject" question={question} onRefusal={setRefusal} />
          </>
        )}
        {publicationState === "published" && (
          <ReasonAct act="return" question={question} onRefusal={setRefusal} />
        )}
        {publicationState === "rejected" && (
          <ResubmitButton question={question} onRefusal={setRefusal} />
        )}
      </div>
    </div>
  );
}
