import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AverageRating, ratingIsShown } from "@/features/questions/average-rating";
import { ClientRestriction } from "@/features/questions/client-restriction";
import {
  PublishButton,
  ReasonAct,
  ResubmitButton,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { provenanceWording } from "@/features/questions/provenance-wording";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { QuestionHistory } from "@/features/questions/question-history";
import { QuestionNotShown } from "@/features/questions/question-not-shown";
import { QuestionTags } from "@/features/questions/question-tags";
import { useQuestion } from "@/features/questions/questions.queries";
import { RatingControl } from "@/features/questions/rating-control";
import { ScreenSection } from "@/features/questions/screen-section";
import { PageHeader } from "@/ui/page-header";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";
import { Card } from "@/ui/shadcn/card";
import { Separator } from "@/ui/shadcn/separator";

export function QuestionScreen({ questionId }: { questionId: string }) {
  const question = useQuestion(questionId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link to="/" className="text-primary text-sm hover:underline">
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
  return (
    // The details come before the main column, so on a phone they sit just under the title.
    <article className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:grid-rows-[auto_1fr]">
      <PageHeader title={question.text} />
      <AboutThisQuestion question={question} />
      <div className="flex flex-col gap-6 md:col-start-1">
        {question.reason !== null && (
          <ScreenSection id="why-it-was-rejected" title="Why it was Rejected">
            <p className="whitespace-pre-line">{question.reason}</p>
          </ScreenSection>
        )}
        <ScreenSection id="answer-notes" title="Answer Notes">
          <p className="whitespace-pre-line">{question.answerNotes}</p>
          <QuestionTags tags={question.tags} />
        </ScreenSection>
        {ratingIsShown(question) && (
          <ScreenSection id="rating" title="Rating">
            <AverageRating rating={question.rating} />
            {/* Offered by the Publication State alone, like the acts (ADR-0002). */}
            {question.publicationState === "published" && <RatingControl question={question} />}
          </ScreenSection>
        )}
      </div>
    </article>
  );
}

type TitledProps = { id: string; title: string; children: ReactNode };

function AboutThisQuestion({ question }: { question: Question }) {
  const state = publicationStateWording[question.publicationState];
  return (
    <section
      aria-labelledby="about-this-question"
      className="md:col-start-2 md:row-span-2 md:row-start-1"
    >
      <Card className="gap-5 px-6">
        <h2 id="about-this-question" className="text-lg font-semibold">
          About this Question
        </h2>
        <QuestionDetail id="publication-state" title="Publication State">
          <PublicationStateBadge state={question.publicationState} />
          <p className="text-muted-foreground">{state.meaning}</p>
        </QuestionDetail>
        {question.client !== null && (
          <QuestionDetail id="who-can-see-it" title="Who can see it">
            <ClientRestriction client={question.client} />
            <p className="text-muted-foreground">
              Only Viewers with a Grant for {question.client.name} can see this Question.
            </p>
          </QuestionDetail>
        )}
        <WhereItCameFrom question={question} />
        <Separator />
        <PublicationActs question={question} />
      </Card>
    </section>
  );
}

function QuestionDetail({ id, title, children }: TitledProps) {
  return (
    <section className="flex flex-col items-start gap-1.5 text-sm" aria-labelledby={id}>
      <h3 id={id} className="font-medium">
        {title}
      </h3>
      {children}
    </section>
  );
}

function WhereItCameFrom({ question }: { question: Question }) {
  const { name, meaning } = provenanceWording[question.provenance];
  return (
    <QuestionDetail id="where-it-came-from" title="Where it came from">
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
    </QuestionDetail>
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
        {/* Shown to every Viewer: whether this one may edit is the API's answer, and it gives
            it when they save (ADR-0002). */}
        <Button asChild variant="outline" size="sm">
          <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
            Edit
          </Link>
        </Button>
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
