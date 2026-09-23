import type { Question } from "@iqb/shared";
import { Badge } from "@/ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/shadcn/card";

export function QuestionCard({ question }: { question: Question }) {
  return (
    <article>
      <Card>
        <CardHeader>
          <CardTitle className="leading-snug">{question.text}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm whitespace-pre-line">
            {question.answerNotes}
          </p>
          {question.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Tags">
              {question.tags.map(({ category, tag }) => (
                <li key={`${category}:${tag}`}>
                  <Badge variant="secondary" title={category}>
                    {tag}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </article>
  );
}
