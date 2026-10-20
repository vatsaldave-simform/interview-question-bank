import type { PendingQuestion, PendingQuestionListResponse } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { ClipboardCheckIcon } from "lucide-react";
import { useState } from "react";
import {
  ActRefusedInList,
  PublishButton,
  ReasonAct,
  type ActProps,
  type ActRefused,
} from "@/features/questions/publication-acts";
import {
  CompactQuestionCard,
  CompactQuestionCardsLoading,
} from "@/features/questions/compact-question-card";
import { QuestionPages } from "@/features/questions/question-pages";
import { useReviewQueue } from "@/features/questions/questions.queries";
import { waitedWording } from "@/platform/when-wording";
import { EmptyList } from "@/ui/empty-list";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-section">
      <PageHeader
        title="Review queue"
        description="Pending Questions waiting on a Reviewer, the one that has waited longest first."
      />
      {refusal !== null && <ActRefusedInList refused={refusal} />}
      {queue.isPending ? (
        <CompactQuestionCardsLoading label="Loading the Pending Questions…" />
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

type PendingListProps = { page: PendingQuestionListResponse; onRefusal: ActProps["onRefusal"] };

function PendingList({ page, onRefusal }: PendingListProps) {
  if (page.questions.length === 0 && page.offset === 0) {
    return (
      <EmptyList icon={ClipboardCheckIcon} title="Nothing is waiting for review">
        You are done for now. New Questions appear here when they are submitted.
      </EmptyList>
    );
  }
  if (page.questions.length === 0) {
    return <p className="text-muted-foreground">There are no more Pending Questions.</p>;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label="Pending Questions">
      {page.questions.map((question) => (
        <li key={question.id}>
          <PendingCard question={question} onRefusal={onRefusal} />
        </li>
      ))}
    </ul>
  );
}

type PendingCardProps = ActProps & { question: PendingQuestion };

function PendingCard({ question, onRefusal }: PendingCardProps) {
  return (
    <CompactQuestionCard
      question={question}
      details={
        <>
          <p>From {question.author.email}</p>
          {/* From when it was added, because the API does not say when it was sent for review. */}
          <p>Waiting {waitedWording(question.createdAt)}</p>
        </>
      }
      acts={
        // Publish is the one filled button, so a page of cards does not read as a wall of them.
        <>
          <PublishButton question={question} onRefusal={onRefusal} />
          <ReasonAct act="reject" variant="secondary" question={question} onRefusal={onRefusal} />
          <Button asChild variant="ghost" size="sm">
            <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
              Edit
            </Link>
          </Button>
        </>
      }
    />
  );
}
