import type { Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { QuestionTags } from "@/features/questions/question-tags";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/shadcn/card";

export function QuestionCard({ question }: { question: Question }) {
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
        </CardContent>
      </Card>
    </article>
  );
}
