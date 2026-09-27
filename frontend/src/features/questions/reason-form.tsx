import { rejectQuestionRequestSchema, type RejectQuestionRequest } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import {
  focusFirstProblem,
  problemsIn,
  refusalOf,
  type FieldProblems,
} from "@/platform/field-problems";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldError, FieldLabel } from "@/ui/shadcn/field";
import { Textarea } from "@/ui/shadcn/textarea";

type Problems = FieldProblems<"reason">;

const problemWording: Record<"reason", string> = {
  reason: "Say why, so the Author can put it right, in 2,000 characters or fewer.",
};

type ReasonFormProps = {
  /** Unique on the page, because a list shows one of these per Question. */
  fieldId: string;
  label: string;
  sendLabel: string;
  sending: boolean;
  /** Rejects with the API's refusal, which lands on the field when it names the reason. */
  onSend: (request: RejectQuestionRequest) => Promise<unknown>;
  /** Told a refusal that names no field, for the screen to show. */
  onRefusal: (message: string) => void;
  onCancel: () => void;
};

/** Rejecting and returning both ask for a reason, because the Author reads it the same way
 * to put the Question right (ADR-0013). */
export function ReasonForm(props: ReasonFormProps) {
  const { fieldId, label, sendLabel, sending, onSend, onRefusal, onCancel } = props;
  const [problems, setProblems] = useState<Problems>({});

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const checked = rejectQuestionRequestSchema.safeParse({
      reason: new FormData(form).get("reason"),
    });
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }
    setProblems({});
    await onSend(checked.data).catch((reason: Error) => {
      const refused = refusalOf(problemWording, reason);
      setProblems(refused.problems);
      if (refused.message !== null) onRefusal(refused.message);
      focusFirstProblem(form, refused.problems);
    });
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first.
    <form
      noValidate
      onSubmit={(event) => void send(event)}
      className="flex w-full flex-col gap-2"
    >
      <Field data-invalid={problems.reason !== undefined}>
        <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
        <Textarea
          id={fieldId}
          name="reason"
          aria-invalid={problems.reason !== undefined}
          aria-describedby={problems.reason === undefined ? undefined : `${fieldId}-problem`}
        />
        <FieldError id={`${fieldId}-problem`}>{problems.reason}</FieldError>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={sending}>
          {sendLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
