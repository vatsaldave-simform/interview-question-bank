import type { QuestionListResponse } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { useState } from "react";
import { AddAQuestionButton } from "@/features/questions/add-a-question-button";
import {
  ActRefusedInList,
  ResubmitButton,
  type ActProps,
  type ActRefused,
} from "@/features/questions/publication-acts";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionCardsLoading } from "@/features/questions/question-cards-loading";
import { QuestionPages } from "@/features/questions/question-pages";
import { useOwnQuestions } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { EmptyList } from "@/ui/empty-list";
import { PageHeader } from "@/ui/page-header";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Button } from "@/ui/shadcn/button";

type OwnQuestionsScreenProps = { offset: number; onMove: (offset: number) => void };

export function OwnQuestionsScreen({ offset, onMove }: OwnQuestionsScreenProps) {
  const own = useOwnQuestions(offset);
  const [refusal, setRefusal] = useState<ActRefused | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Your Questions"
        description="The Questions you added that are not in the bank yet: Pending, or Rejected with the reason."
      />
      {refusal !== null && <ActRefusedInList refused={refusal} />}
      {own.isPending ? (
        <QuestionCardsLoading label="Loading your Questions…" />
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
  if (page.questions.length === 0 && page.offset === 0) {
    return (
      <EmptyList
        icon={FileTextIcon}
        title="You have no Pending or Rejected Questions"
        // Offered to all, because the API shows this list only to a Viewer who may add one.
        action={<AddAQuestionButton />}
      >
        Questions you add show here until a Reviewer Publishes them.
      </EmptyList>
    );
  }
  if (page.questions.length === 0) {
    return <p className="text-muted-foreground">There are no more of your Questions.</p>;
  }
  return (
    <ul className="flex flex-col gap-4" aria-label="Your Questions">
      {page.questions.map((question) => (
        <li key={question.id}>
          <QuestionCard
            question={question}
            badges={<PublicationStateBadge state={question.publicationState} />}
          >
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
