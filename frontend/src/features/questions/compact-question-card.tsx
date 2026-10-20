import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ClientRestriction } from "@/features/questions/client-restriction";
import { QuestionTags } from "@/features/questions/question-tags";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { ListCard } from "@/ui/list-card";
import { RowDetails } from "@/ui/row-details";
import { Card, CardTitle } from "@/ui/shadcn/card";
import { Skeleton } from "@/ui/shadcn/skeleton";

type CompactQuestionCardProps = {
  question: Question;
  /** More badges before the Tags, such as the Publication State. */
  badges?: ReactNode;
  /** The line under the chips, as in "From author@iqb.test". */
  details: ReactNode;
  acts?: ReactNode;
};

/** For a list a Viewer works through, so it leaves out the Answer Notes the Question's page shows. */
export function CompactQuestionCard({ question, badges, details, acts }: CompactQuestionCardProps) {
  return (
    <article>
      <ListCard acts={acts}>
        <CardTitle className="leading-snug">
          <Link
            to="/questions/$questionId"
            params={{ questionId: question.id }}
            className="hover:text-primary hover:underline"
          >
            {question.text}
          </Link>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {badges}
          <QuestionTags tags={question.tags} />
          <ClientRestriction client={question.client} />
        </div>
        <RowDetails>{details}</RowDetails>
        {question.reason !== null && <RejectionReason reason={question.reason} />}
      </ListCard>
    </article>
  );
}

/** Shaped like a page of `CompactQuestionCard`s, so the page does not jump when they arrive. */
export function CompactQuestionCardsLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((card) => (
        <Card key={card} className="gap-2 px-4.5 py-4">
          <Skeleton className="bg-muted h-5 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="bg-muted h-5 w-16 rounded-full" />
            <Skeleton className="bg-muted h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="bg-muted h-4 w-1/3" />
        </Card>
      ))}
    </div>
  );
}
