import type { QuestionListResponse } from "@iqb/shared";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionPages } from "@/features/questions/question-pages";
import { useOwnQuestions } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Badge } from "@/ui/shadcn/badge";

type OwnQuestionsScreenProps = { offset: number; onMove: (offset: number) => void };

export function OwnQuestionsScreen({ offset, onMove }: OwnQuestionsScreenProps) {
  const own = useOwnQuestions(offset);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your Questions</h1>
        <p className="text-muted-foreground text-sm">
          The Questions you added that are not in the bank: Pending, waiting on a Reviewer, or
          Rejected, with the reason. The newest is first.
        </p>
      </div>
      {own.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading your Questions…
        </p>
      ) : own.isError ? (
        <ListNotLoaded what="Questions" reason={own.error} onRetry={() => void own.refetch()} />
      ) : (
        <>
          <OwnQuestionList page={own.data} />
          <QuestionPages offset={offset} shown={own.data.questions.length} onMove={onMove} />
        </>
      )}
    </div>
  );
}

function OwnQuestionList({ page }: { page: QuestionListResponse }) {
  if (page.questions.length === 0) {
    return (
      <p className="text-muted-foreground">
        {page.offset === 0
          ? "You have no Pending or Rejected Question."
          : "There are no more of your Questions."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4" aria-label="Your Questions">
      {page.questions.map((question) => (
        <li key={question.id}>
          <QuestionCard question={question}>
            <Badge variant="outline">
              {publicationStateWording[question.publicationState].name}
            </Badge>
            {question.reason !== null && <RejectionReason reason={question.reason} />}
          </QuestionCard>
        </li>
      ))}
    </ul>
  );
}
