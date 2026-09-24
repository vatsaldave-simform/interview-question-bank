import type { ChangeEvent, NearDuplicate, QuestionEdited, QuestionTag } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { useQuestionHistory } from "@/features/questions/questions.queries";
import { whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";

const whenWording = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function QuestionHistory({ questionId }: { questionId: string }) {
  const history = useQuestionHistory(questionId);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="history">
      <h2 id="history" className="font-medium">
        History
      </h2>
      {history.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading the history…
        </p>
      ) : history.isError ? (
        <Alert variant="destructive">
          <AlertTitle>The history could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{whatWentWrong(history.error)}</p>
            <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : history.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No changes have been recorded.</p>
      ) : (
        <ol aria-labelledby="history" className="flex flex-col gap-3">
          {history.data.map((event) => (
            <li key={event.id} className="flex flex-col gap-1 text-sm">
              <p>
                {event.viewerEmail} {whatHappened(event)}
                {" · "}
                <time dateTime={event.at} className="text-muted-foreground">
                  {whenWording.format(new Date(event.at))}
                </time>
              </p>
              {event.type === "question_edited" && <WhatAnEditChanged edit={event.payload} />}
              {event.type === "near_duplicate_overridden" && (
                <NearDuplicatesNamed nearDuplicates={event.payload.nearDuplicates} />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function whatHappened(event: ChangeEvent): string {
  switch (event.type) {
    case "question_added":
      return "added this Question";
    case "question_edited":
      return "edited this Question";
    case "near_duplicate_overridden": {
      const { nearDuplicates } = event.payload;
      return `confirmed this Question is different from ${nearDuplicatesWording(nearDuplicates)}`;
    }
    // None of these three ever names a Question, so none ever reaches a Question's
    // history; they are here so that a new kind of event is a type error rather than a
    // blank line (ADR-0015).
    case "near_duplicate_refused":
      return "tried to add a Question that was refused as a Near-Duplicate";
    case "administrator_appointed":
      return "appointed an Administrator";
    case "administrator_withdrawn":
      return "withdrew an Administrator's authority";
    case "role_changed":
      return "changed a Viewer's role";
  }
}

const tagsWording = (tags: readonly QuestionTag[]) =>
  tags.length === 0 ? "no Tags" : tags.map(({ tag }) => tag).join(", ");

/** Only the fields the event names: one the edit left alone is absent from it. */
function WhatAnEditChanged({ edit }: { edit: QuestionEdited }) {
  const changes = [
    edit.text && { field: "Text", before: edit.text.before, after: edit.text.after },
    edit.answerNotes && {
      field: "Answer Notes",
      before: edit.answerNotes.before,
      after: edit.answerNotes.after,
    },
    edit.tags && {
      field: "Tags",
      before: tagsWording(edit.tags.before),
      after: tagsWording(edit.tags.after),
    },
  ].filter((change) => change !== undefined);

  return (
    <div className="flex flex-col gap-2 border-l-2 pl-3">
      {changes.map(({ field, before, after }) => (
        <div key={field} role="group" aria-label={field} className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium">{field}</span>
          <del className="text-muted-foreground whitespace-pre-line">{before}</del>
          <ins className="whitespace-pre-line no-underline">{after}</ins>
        </div>
      ))}
    </div>
  );
}

function nearDuplicatesWording(nearDuplicates: readonly NearDuplicate[]): string {
  return nearDuplicates.length === 1
    ? "a Near-Duplicate"
    : `${nearDuplicates.length} Near-Duplicates`;
}

function NearDuplicatesNamed({ nearDuplicates }: { nearDuplicates: readonly NearDuplicate[] }) {
  return (
    <ul className="flex flex-col gap-1 border-l-2 pl-3">
      {nearDuplicates.map(({ questionId, text }) => (
        <li key={questionId}>
          <Link to="/questions/$questionId" params={{ questionId }} className="hover:underline">
            {text}
          </Link>
        </li>
      ))}
    </ul>
  );
}
