import type { CategoryName } from "@iqb/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CategoryTags } from "@/features/questions/category-tags";
import {
  draftFields,
  type DraftProblems,
  type QuestionDraft,
} from "@/features/questions/question-problems";
import { useCategories } from "@/features/questions/questions.queries";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/ui/shadcn/field";
import { Textarea } from "@/ui/shadcn/textarea";

type QuestionFormProps = {
  initial: QuestionDraft;
  problems: DraftProblems;
  /** Why the last send was refused, when no one field was to blame. */
  refusal: { title: string; message: string } | null;
  sending: boolean;
  submit: { label: string; sendingLabel: string };
  onSubmit: (draft: QuestionDraft) => void;
};

/** Holds the draft and shows the problems it is handed. Checking the draft and sending
 * it belong to the screen, because adding and editing check it against different schemas. */
export function QuestionForm(props: QuestionFormProps) {
  const { initial, problems, refusal, sending, submit, onSubmit } = props;
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
    // The schema is the only check, so the browser's own validation must not answer first.
    <form ref={form} noValidate onSubmit={send}>
      <FieldGroup>
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>{refusal.title}</AlertTitle>
            <AlertDescription>{refusal.message}</AlertDescription>
          </Alert>
        )}
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
        <Button type="submit" disabled={sending} className="self-start">
          {sending ? submit.sendingLabel : submit.label}
        </Button>
      </FieldGroup>
    </form>
  );
}

type TagsFieldProps = {
  chosen: QuestionDraft["tags"];
  problem: string | undefined;
  onChange: (tags: QuestionDraft["tags"]) => void;
};

function TagsField({ chosen, problem, onChange }: TagsFieldProps) {
  const categories = useCategories();

  function setTagsIn(category: CategoryName, tags: string[]) {
    onChange([
      ...chosen.filter((one) => one.category !== category),
      ...tags.map((tag) => ({ category, tag })),
    ]);
  }

  return (
    <FieldSet data-invalid={problem !== undefined}>
      <FieldLegend>Tags</FieldLegend>
      {categories.isPending ? (
        <p className="text-muted-foreground text-sm">Loading the Tags…</p>
      ) : categories.isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>The Tags could not be loaded.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void categories.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 sm:grid-cols-3">
          {categories.data.map((category) => (
            <CategoryTags
              key={category.name}
              idPrefix="question"
              category={category}
              chosen={chosen.filter((one) => one.category === category.name).map(({ tag }) => tag)}
              onChange={(tags) => setTagsIn(category.name, tags)}
            />
          ))}
        </div>
      )}
      <FieldError>{problem}</FieldError>
    </FieldSet>
  );
}
