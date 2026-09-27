import type { QuestionListResponse } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ActRefusedInList,
  ResubmitButton,
  type ActProps,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionPages } from "@/features/questions/question-pages";
import { useOwnQuestions } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Badge } from "@/ui/shadcn/badge";
import { Button } from "@/ui/shadcn/button";

type OwnQuestionsScreenProps = { offset: number; onMove: (offset: number) => void };

export function OwnQuestionsScreen({ offset, onMove }: OwnQuestionsScreenProps) {
  const own = useOwnQuestions(offset);
  const [refusal, setRefusal] = useState<ActRefused | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your Questions</h1>
        <p className="text-muted-foreground text-sm">
          The Questions you added that are not in the bank: Pending, waiting on a Reviewer, or
          Rejected, with the reason. The newest is first.
        </p>
      </div>
      {refusal !== null && <ActRefusedInList refused={refusal} />}
      {own.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading your Questions…
        </p>
      ) : own.isError ? (
        <ListNotLoaded what="Questions" reason={own.error} onRetry={() => void own.refetch()} />
      ) : (
        <>
          <OwnQuestionList page={own.data} onRefusal={setRefusal} />
          <QuestionPages
            offset={offset}
            shown={own.data.questions.length}
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

type OwnQuestionListProps = { page: QuestionListResponse; onRefusal: ActProps["onRefusal"] };

function OwnQuestionList({ page, onRefusal }: OwnQuestionListProps) {
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
            {question.publicationState === "rejected" && (
              <RejectedActs question={question} onRefusal={onRefusal} />
            )}
          </QuestionCard>
        </li>
      ))}
    </ul>
  );
}

function RejectedActs({ question, onRefusal }: ActProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link to="/questions/$questionId/edit" params={{ questionId: question.id }}>
          Edit
        </Link>
      </Button>
      <ResubmitButton question={question} onRefusal={onRefusal} />
    </div>
  );
}
