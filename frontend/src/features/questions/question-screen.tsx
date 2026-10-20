import { cn } from "cn";
import {
  mayEdit,
  mayPublish,
  mayReject,
  mayResubmit,
  mayReturn,
  type Question,
  type Viewer,
} from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { StarIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AverageRating, ratingIsShown } from "@/features/questions/average-rating";
import { ClientRestriction } from "@/features/questions/client-restriction";
import {
  PublishButton,
  ReasonAct,
  ResubmitButton,
  type ActProps,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { provenanceWording } from "@/features/questions/provenance-wording";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { QuestionHistory } from "@/features/questions/question-history";
import { QuestionNotShown } from "@/features/questions/question-not-shown";
import { QuestionTags } from "@/features/questions/question-tags";
import { backToBrowse } from "@/features/questions/question-trail";
import { useQuestion } from "@/features/questions/questions.queries";
import { RatingControl } from "@/features/questions/rating-control";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { useSession } from "@/platform/session";
import { PageHeader } from "@/ui/page-header";
import { PageTrail } from "@/ui/page-trail";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";
import { Card } from "@/ui/shadcn/card";
import { smallHeading } from "@/ui/small-heading";

export function QuestionScreen({ questionId }: { questionId: string }) {
  const question = useQuestion(questionId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-section">
      {/* The header waits for the Question, so until then the trail stands on its own. */}
      {!question.isSuccess && <PageTrail back={backToBrowse} here="Question" />}
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
  const [refusal, setRefusal] = useState<ActRefused | null>(null);
  return (
    <article className="flex flex-col gap-section">
      <PageHeader
        title={question.text}
        description="One Question, with its Answer Notes and where it came from."
        trail={{ back: backToBrowse, here: question.text }}
        action={<PublicationActs question={question} onRefusal={setRefusal} />}
      />
      {refusal !== null && (
        <ActNotDone title={`This Question ${refusal.notDone}.`} reason={refusal.message} />
      )}
      <div className="grid items-start gap-section min-[980px]:grid-cols-[minmax(0,1fr)_300px]">
        <AnswerNotes question={question} />
        <AboutThisQuestion question={question} />
      </div>
    </article>
  );
}

function AnswerNotes({ question }: { question: Question }) {
  return (
    <section aria-labelledby="answer-notes">
      <Card className="gap-3.5 px-7 py-6.5">
        {question.reason !== null && (
          <section aria-label="Why it was Rejected">
            <RejectionReason reason={question.reason} />
          </section>
        )}
        {(question.tags.length > 0 || question.client !== null) && (
          <div className="flex flex-wrap items-center gap-2">
            <QuestionTags tags={question.tags} />
            <ClientRestriction client={question.client} />
          </div>
        )}
        <h2 id="answer-notes" className={cn(smallHeading, "text-[0.9375rem]")}>
          Answer Notes
        </h2>
        <p className="max-w-[68ch] text-[1.0625rem] leading-[1.7] whitespace-pre-line">
          {question.answerNotes}
        </p>
      </Card>
    </section>
  );
}

type TitledProps = { id: string; title: string; children: ReactNode };

function AboutThisQuestion({ question }: { question: Question }) {
  const state = publicationStateWording[question.publicationState];
  return (
    <section aria-labelledby="about-this-question">
      <Card className="gap-4 p-(--spacing-panel)">
        <h2 id="about-this-question" className="sr-only">
          About this Question
        </h2>
        <QuestionDetail id="publication-state" title="Publication State">
          <PublicationStateBadge state={question.publicationState} />
          <p className="text-muted-foreground">{state.meaning}</p>
        </QuestionDetail>
        {question.client !== null && (
          <QuestionDetail id="who-can-see-it" title="Who can see it">
            <p>Only Viewers with a Grant for {question.client.name} can see this Question.</p>
          </QuestionDetail>
        )}
        <WhereItCameFrom question={question} />
        {ratingIsShown(question) && (
          <QuestionDetail id="rating" title="Rating">
            <div className="flex items-center gap-1.5">
              {question.rating.average !== null && (
                <StarIcon aria-hidden="true" className="fill-brand-red text-brand-red size-4" />
              )}
              <AverageRating rating={question.rating} />
            </div>
          </QuestionDetail>
        )}
        {/* Offered by the Publication State alone: whether this Viewer may rate is the API's
            answer (ADR-0002). */}
        {question.publicationState === "published" && <RatingControl question={question} />}
      </Card>
    </section>
  );
}

function QuestionDetail({ id, title, children }: TitledProps) {
  return (
    <section className="flex flex-col items-start gap-0.5" aria-labelledby={id}>
      <h3 id={id} className={smallHeading}>
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

/** Shows only the acts the API would let this Viewer do, by the same rules it uses
 * (ADR-0045). */
function PublicationActs({ question, onRefusal }: ActProps) {
  const session = useSession();
  // The sign-in check already stands in front of this screen.
  if (session.status !== "signed-in") return null;
  return <PublicationActsFor viewer={session.viewer} question={question} onRefusal={onRefusal} />;
}

function PublicationActsFor({ viewer, question, onRefusal }: ActProps & { viewer: Viewer }) {
  const { publicationState } = question;
  const acts = {
    edit: mayEdit(viewer, question),
    publish: publicationState === "pending" && mayPublish(viewer),
    reject: publicationState === "pending" && mayReject(viewer, question),
    return: publicationState === "published" && mayReturn(viewer),
    resubmit: publicationState === "rejected" && mayResubmit(viewer, question),
  };
  if (!Object.values(acts).some(Boolean)) return null;

  const props = { question, onRefusal, size: "default" } as const;
  return (
    <div
      role="group"
      aria-label="What you can do with this Question"
      className="flex flex-wrap gap-2"
    >
      {acts.edit && (
        <Button asChild variant="outline">
          <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
            Edit
          </Link>
        </Button>
      )}
      {acts.publish && <PublishButton {...props} />}
      {acts.reject && <ReasonAct act="reject" variant="secondary" {...props} />}
      {acts.return && <ReasonAct act="return" variant="secondary" {...props} />}
      {acts.resubmit && <ResubmitButton {...props} />}
    </div>
  );
}
