import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  draftFields,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { TagsField } from "@/features/questions/tags-field";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Card } from "@/ui/shadcn/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Textarea } from "@/ui/shadcn/textarea";

type QuestionFormProps = {
  initial: QuestionDraft;
  problems: DraftProblems;
  /** Why the last send was refused, when no one field was to blame. */
  refusal: { title: string; message: string } | null;
  sending: boolean;
  submit: { label: string; sendingLabel: string };
  /** Shown beside the submit button, such as a way to leave without sending. */
  cancel?: ReactNode;
  onSubmit: (draft: QuestionDraft) => void;
  /** Fields only one of the two forms has, shown after the ones they share. */
  children?: ReactNode;
  /** Shown in the same card after the form, for what is sent apart from it. */
  after?: ReactNode;
};

/** Checking and sending the draft belong to the screen, because adding and editing check it
 * against different schemas. */
export function QuestionForm(props: QuestionFormProps) {
  const { initial, problems, refusal, sending, submit, cancel, onSubmit, children, after } = props;
  const [draft, setDraft] = useState(initial);
  const form = useRef<HTMLFormElement>(null);

  // Someone using a screen reader is otherwise told something is wrong and left to find
  // it, and the problems can arrive after the API answers rather than on submit.
  useEffect(() => {
    const first = draftFields.find((field) => problems[field] !== undefined);
    const control = first === undefined ? null : form.current?.elements.namedItem(first);
    if (control instanceof HTMLTextAreaElement) control.focus();
  }, [problems]);

  function send(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(draft);
  }

  return (
    <Card className="gap-section p-6">
      {/* The schema is the only check, so the browser's own validation must not answer first. */}
      <form ref={form} noValidate onSubmit={send} className="flex flex-col gap-section">
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>{refusal.title}</AlertTitle>
            <AlertDescription>{refusal.message}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field data-invalid={problems.text !== undefined}>
            <FieldLabel htmlFor="question-text">Question</FieldLabel>
            <Textarea
              id="question-text"
              name="text"
              value={draft.text}
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              aria-invalid={problems.text !== undefined}
              aria-describedby={problems.text === undefined ? undefined : "question-text-problem"}
            />
            <FieldError id="question-text-problem">{problems.text}</FieldError>
          </Field>
          <Field data-invalid={problems.answerNotes !== undefined}>
            <FieldLabel htmlFor="question-answer-notes">Answer Notes</FieldLabel>
            <FieldDescription>What a good answer looks like.</FieldDescription>
            <Textarea
              id="question-answer-notes"
              name="answerNotes"
              value={draft.answerNotes}
              onChange={(event) => setDraft({ ...draft, answerNotes: event.target.value })}
              aria-invalid={problems.answerNotes !== undefined}
              aria-describedby={
                problems.answerNotes === undefined ? undefined : "question-answer-notes-problem"
              }
              className="min-h-32"
            />
            <FieldError id="question-answer-notes-problem">{problems.answerNotes}</FieldError>
          </Field>
          <TagsField
            chosen={draft.tags}
            problem={problems.tags}
            onChange={(tags) => setDraft({ ...draft, tags })}
          />
          {children}
        </FieldGroup>
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" disabled={sending}>
            {sending ? submit.sendingLabel : submit.label}
          </Button>
          {cancel}
        </div>
      </form>
      {after}
    </Card>
  );
}
