import type { Question, QuestionListResponse } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PublishButton, ReasonAct, type ActRefused } from "@/features/questions/publication-acts";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionPages } from "@/features/questions/question-pages";
import { useReviewQueue } from "@/features/questions/questions.queries";
import { ActNotDone } from "@/ui/act-not-done";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Button } from "@/ui/shadcn/button";

type ReviewScreenProps = { offset: number; onMove: (offset: number) => void };

/** Shown to whoever opens the address: whether they may see the queue is the API's answer,
 * and the screen reports its refusal. */
export function ReviewScreen({ offset, onMove }: ReviewScreenProps) {
  const queue = useReviewQueue(offset);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-muted-foreground text-sm">
          Pending Questions waiting on a Reviewer, the one that has waited longest first.
        </p>
      </div>
      {refusal !== null && (
        <ActNotDone title={`"${refusal.text}" ${refusal.notDone}.`} reason={refusal.message} />
      )}
      {queue.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading the Pending Questions…
        </p>
      ) : queue.isError ? (
        <ListNotLoaded
          what="Pending Questions"
          reason={queue.error}
          onRetry={() => void queue.refetch()}
        />
      ) : (
        <>
          <PendingList page={queue.data} onRefusal={setRefusal} />
          <QuestionPages offset={offset} shown={queue.data.questions.length} onMove={onMove} />
        </>
      )}
    </div>
  );
}

/** Names the Question, because its card may have left the queue by the time this shows. */
type Refusal = ActRefused & { text: string };

type PendingListProps = {
  page: QuestionListResponse;
  onRefusal: (refusal: Refusal | null) => void;
};

function PendingList({ page, onRefusal }: PendingListProps) {
  if (page.questions.length === 0) {
    return (
      <p className="text-muted-foreground">
        {page.offset === 0
          ? "No Question is waiting for review."
          : "There are no more Pending Questions."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4" aria-label="Pending Questions">
      {page.questions.map((question) => (
        <li key={question.id}>
          <PendingCard question={question} onRefusal={onRefusal} />
        </li>
      ))}
    </ul>
  );
}

type PendingCardProps = {
  question: Question;
  onRefusal: (refusal: Refusal | null) => void;
};

function PendingCard({ question, onRefusal }: PendingCardProps) {
  const refusedFor = (refused: ActRefused | null) =>
    onRefusal(refused === null ? null : { ...refused, text: question.text });

  return (
    <QuestionCard question={question}>
      <div className="flex flex-wrap items-start gap-2">
        <PublishButton question={question} onRefusal={refusedFor} />
        <Button asChild variant="outline" size="sm">
          <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
            Edit
          </Link>
        </Button>
        <ReasonAct act="reject" question={question} onRefusal={refusedFor} />
      </div>
    </QuestionCard>
  );
}
