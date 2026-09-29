import type { QuestionListResponse } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ActRefusedInList,
  PublishButton,
  ReasonAct,
  type ActProps,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionCardsLoading } from "@/features/questions/question-cards-loading";
import { QuestionPages } from "@/features/questions/question-pages";
import { useReviewQueue } from "@/features/questions/questions.queries";
import { PageHeader } from "@/ui/page-header";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Button } from "@/ui/shadcn/button";

type ReviewScreenProps = { offset: number; onMove: (offset: number) => void };

/** Shown to whoever opens the address: whether they may see the queue is the API's answer,
 * and the screen reports its refusal. */
export function ReviewScreen({ offset, onMove }: ReviewScreenProps) {
  const queue = useReviewQueue(offset);
  const [refusal, setRefusal] = useState<ActRefused | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Review queue"
        description="Pending Questions waiting on a Reviewer, the one that has waited longest first."
      />
      {refusal !== null && <ActRefusedInList refused={refusal} />}
      {queue.isPending ? (
        <QuestionCardsLoading label="Loading the Pending Questions…" />
      ) : queue.isError ? (
        <ListNotLoaded
          what="Pending Questions"
          reason={queue.error}
          onRetry={() => void queue.refetch()}
        />
      ) : (
        <>
          <PendingList page={queue.data} onRefusal={setRefusal} />
          <QuestionPages
            offset={offset}
            shown={queue.data.questions.length}
            onMove={(next) => {
              setRefusal(null);
              onMove(next);
            }}
          />
        </>
      )}
    </div>
  );
}

type PendingListProps = { page: QuestionListResponse; onRefusal: ActProps["onRefusal"] };

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

function PendingCard({ question, onRefusal }: ActProps) {
  return (
    <QuestionCard question={question}>
      {/* Publish is the one filled button, so a page of cards does not read as a wall of them. */}
      <div className="flex flex-wrap items-start gap-2">
        <PublishButton question={question} onRefusal={onRefusal} />
        <Button asChild variant="ghost" size="sm">
          <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
            Edit
          </Link>
        </Button>
        <ReasonAct act="reject" variant="ghost" question={question} onRefusal={onRefusal} />
      </div>
    </QuestionCard>
  );
}
