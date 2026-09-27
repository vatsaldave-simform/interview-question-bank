import { decideRoleRequestRequestSchema, type DecideRoleRequestRequest } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useDecideRoleRequest } from "@/features/role-requests/role-requests.queries";
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
  reason: "Say why, so they can act on it, in 2,000 characters or fewer.",
};

type RoleRequestDecisionProps = {
  roleRequestId: string;
  /** Told the API's refusal, or null when a new decision starts. The queue shows it, because
   * the queue is asked again after a refusal and this row may leave it. */
  onRefusal: (message: string | null) => void;
};

export function RoleRequestDecision({ roleRequestId, onRefusal }: RoleRequestDecisionProps) {
  const decide = useDecideRoleRequest(roleRequestId);
  const [denying, setDenying] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  const reasonId = `deny-reason-${roleRequestId}`;

  function send(decision: DecideRoleRequestRequest, form?: HTMLFormElement): void {
    onRefusal(null);
    decide.mutate(decision, {
      onError: (reason) => {
        const refused = refusalOf(problemWording, reason);
        setProblems(refused.problems);
        if (refused.message !== null) onRefusal(refused.message);
        if (form !== undefined) focusFirstProblem(form, refused.problems);
      },
    });
  }

  function deny(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const checked = decideRoleRequestRequestSchema.safeParse({
      outcome: "denied",
      reason: new FormData(form).get("reason"),
    });
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }
    setProblems({});
    send(checked.data, form);
  }

  return (
    <div className="flex flex-col gap-2">
      {denying ? (
        // The schema is the only check, so the browser's own validation must not answer first.
        <form noValidate onSubmit={deny} className="flex flex-col gap-2">
          <Field data-invalid={problems.reason !== undefined}>
            <FieldLabel htmlFor={reasonId}>Why it is denied</FieldLabel>
            <Textarea
              id={reasonId}
              name="reason"
              aria-invalid={problems.reason !== undefined}
              aria-describedby={problems.reason === undefined ? undefined : `${reasonId}-problem`}
            />
            <FieldError id={`${reasonId}-problem`}>{problems.reason}</FieldError>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={decide.isPending}>
              Send the denial
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDenying(false);
                setProblems({});
                onRefusal(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => send({ outcome: "granted" })}
          >
            Grant
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={decide.isPending}
            onClick={() => setDenying(true)}
          >
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}
