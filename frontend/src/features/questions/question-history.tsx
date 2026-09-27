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
              {event.type === "near_duplicate_refused" && (
                <TextSent text={event.payload.attempted.text} />
              )}
              {(event.type === "near_duplicate_overridden" ||
                event.type === "near_duplicate_refused") && (
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
    case "question_published":
      return "Published this Question";
    case "question_rejected":
      return `Rejected this Question: ${event.payload.reason}`;
    case "question_resubmitted":
      return "resubmitted this Question";
    case "question_returned":
      return `returned this Question to its Author: ${event.payload.reason}`;
    // "A Client", not its name, because the API sends only the id.
    case "question_classified":
      return event.payload.clientId.before === null
        ? "restricted this Question to a Client"
        : "moved this Question to another Client";
    case "question_declassified":
      return "removed this Question's Client restriction, so the whole bank can see it";
    case "near_duplicate_overridden": {
      const { nearDuplicates } = event.payload;
      return `confirmed this Question is different from ${nearDuplicatesWording(nearDuplicates)}`;
    }
    // Refused at publication or on an edit, since a refused submission names no Question.
    case "near_duplicate_refused": {
      const { nearDuplicates } = event.payload;
      const resembled = nearDuplicatesWording(nearDuplicates);
      return `was stopped, as the text sent closely resembled ${resembled}`;
    }
    // None of these ever names a Question, so none ever reaches a Question's
    // history; they are here so that a new kind of event is a type error rather than a
    // blank line (ADR-0015).
    case "administrator_appointed":
      return "appointed an Administrator";
    case "administrator_withdrawn":
      return "withdrew an Administrator's authority";
    case "role_changed":
      return "changed a Viewer's role";
    case "client_created":
      return "created a Client";
    case "permission_grant_issued":
      return "issued a Permission Grant";
    case "permission_grant_revoked":
      return "revoked a Permission Grant";
    case "viewer_created":
      return "created a Viewer";
    case "viewer_deactivated":
      return "Deactivated a Viewer";
    case "viewer_reactivated":
      return "reactivated a Viewer";
    case "role_request_granted":
      return "granted a Role Request";
    case "role_request_denied":
      return "denied a Role Request";
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

/** Shown because a refused edit's text is not the text the Question kept. */
function TextSent({ text }: { text: string }) {
  return (
    <div role="group" aria-label="Text sent" className="flex flex-col gap-0.5 border-l-2 pl-3">
      <span className="text-muted-foreground text-xs font-medium">Text sent</span>
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
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
