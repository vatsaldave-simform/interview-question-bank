import type { PublicationState, Question } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { QuestionHistory } from "@/features/questions/question-history";
import { QuestionTags } from "@/features/questions/question-tags";
import { useQuestion } from "@/features/questions/questions.queries";
import { ApiFailure, whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Badge } from "@/ui/shadcn/badge";
import { Button } from "@/ui/shadcn/button";

const publicationStateWording: Record<PublicationState, { name: string; meaning: string }> = {
  pending: {
    name: "Pending",
    meaning: "Awaiting a Reviewer. It is not in the bank until it is Published.",
  },
  published: { name: "Published", meaning: "In the bank." },
  rejected: { name: "Rejected", meaning: "A Reviewer refused it." },
};

export function QuestionScreen({ questionId }: { questionId: string }) {
  const question = useQuestion(questionId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link to="/" className="text-muted-foreground text-sm hover:underline">
        ← All Questions
      </Link>
      {question.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading the Question…
        </p>
      ) : question.isError ? (
        <QuestionNotShown reason={question.error} onRetry={() => void question.refetch()} />
      ) : (
        <>
          <QuestionInFull question={question.data} />
          <QuestionHistory questionId={questionId} />
        </>
      )}
    </div>
  );
}

function QuestionInFull({ question }: { question: Question }) {
  const state = publicationStateWording[question.publicationState];
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl leading-snug font-semibold">{question.text}</h1>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{state.name}</Badge>
        <span className="text-muted-foreground">{state.meaning}</span>
      </p>
      <section className="flex flex-col gap-2" aria-labelledby="answer-notes">
        <h2 id="answer-notes" className="font-medium">
          Answer Notes
        </h2>
        <p className="whitespace-pre-line">{question.answerNotes}</p>
      </section>
      <QuestionTags tags={question.tags} />
    </article>
  );
}

type QuestionNotShownProps = { reason: Error; onRetry: () => void };

function QuestionNotShown({ reason, onRetry }: QuestionNotShownProps) {
  // One wording for "no such Question" and "one you cannot see", because the API gives
  // one answer for both and anything more would be the client guessing (ADR-0002).
  if (reason instanceof ApiFailure && reason.code === "not_found") {
    return (
      <Alert>
        <AlertTitle>Question not found</AlertTitle>
        <AlertDescription>
          <p>There is no Question at this address that you can see.</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>The Question could not be loaded</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>{whatWentWrong(reason)}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
