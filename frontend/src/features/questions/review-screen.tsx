import type { QuestionListResponse } from "@iqb/shared";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionPages } from "@/features/questions/question-pages";
import { useReviewQueue } from "@/features/questions/questions.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";

type ReviewScreenProps = { offset: number; onMove: (offset: number) => void };

/** Shown to whoever opens the address: whether they may see the queue is the API's answer,
 * and the screen reports its refusal. */
export function ReviewScreen({ offset, onMove }: ReviewScreenProps) {
  const queue = useReviewQueue(offset);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <p className="text-muted-foreground text-sm">
          Pending Questions waiting on a Reviewer, the one that has waited longest first.
        </p>
      </div>
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
          <PendingList page={queue.data} />
          <QuestionPages offset={offset} shown={queue.data.questions.length} onMove={onMove} />
        </>
      )}
    </div>
  );
}

function PendingList({ page }: { page: QuestionListResponse }) {
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
          <QuestionCard question={question} />
        </li>
      ))}
    </ul>
  );
}
