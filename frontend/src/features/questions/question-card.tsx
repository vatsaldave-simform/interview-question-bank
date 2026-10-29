import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { AverageRating, ratingIsShown } from "@/features/questions/average-rating";
import { QuestionClients } from "@/features/questions/question-clients";
import { QuestionTags } from "@/features/questions/question-tags";
import { WhenAdded } from "@/features/questions/when-added";
import { Card, CardTitle } from "@/ui/shadcn/card";

/** Leaves out where the Question came from, because the Question's page shows it. */
export function QuestionCard({ question }: { question: Question }) {
  return (
    <article className="h-full">
      <Card className="h-full gap-2.5 p-(--spacing-panel)">
        <CardTitle className="leading-snug">
          <Link
            to="/questions/$questionId"
            params={{ questionId: question.id }}
            className="hover:text-primary hover:underline"
          >
            {question.text}
          </Link>
        </CardTitle>
        {/* Cut short so a page of cards can be read at a glance; the Question page shows it all. */}
        <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-line">
          {question.answerNotes}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <QuestionTags tags={question.tags} />
          <QuestionClients clients={question.clients} />
        </div>
        <div className="text-muted-foreground mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          {ratingIsShown(question) && <AverageRating rating={question.rating} />}
          <WhenAdded createdAt={question.createdAt} />
        </div>
      </Card>
    </article>
  );
}
