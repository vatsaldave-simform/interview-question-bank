import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AverageRating, ratingIsShown } from "@/features/questions/average-rating";
import { ClientRestriction } from "@/features/questions/client-restriction";
import { provenanceWording } from "@/features/questions/provenance-wording";
import { QuestionTags } from "@/features/questions/question-tags";
import { Badge } from "@/ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/shadcn/card";

type QuestionCardProps = {
  question: Question;
  children?: ReactNode;
};

export function QuestionCard({ question, children }: QuestionCardProps) {
  return (
    <article>
      <Card>
        <CardHeader>
          <CardTitle className="leading-snug">
            <Link
              to="/questions/$questionId"
              params={{ questionId: question.id }}
              className="hover:underline"
            >
              {question.text}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {question.answerNotes}
          </p>
          <QuestionTags tags={question.tags} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline">
              <span className="sr-only">Where it came from: </span>
              {provenanceWording[question.provenance].name}
            </Badge>
            <ClientRestriction client={question.client} />
            {ratingIsShown(question) && <AverageRating rating={question.rating} />}
          </div>
          {children}
        </CardContent>
      </Card>
    </article>
  );
}
