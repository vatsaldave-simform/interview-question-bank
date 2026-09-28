import {
  decideRoleRequestRequestSchema,
  type DecideRoleRequestRequest,
  type RoleRequest,
} from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useDecideRoleRequest } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import {
  focusFirstProblem,
  problemsIn,
  refusalOf,
  type FieldProblems,
} from "@/platform/field-problems";
import { Button } from "@/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/shadcn/dialog";
import { Field, FieldError, FieldLabel } from "@/ui/shadcn/field";
import { Textarea } from "@/ui/shadcn/textarea";

type Problems = FieldProblems<"reason">;

const problemWording: Record<"reason", string> = {
  reason: "Say why, so they can act on it, in 2,000 characters or fewer.",
};

type RoleRequestDecisionProps = {
  roleRequest: RoleRequest;
  /** Told the API's refusal, or null when a new decision starts. The queue shows it, because
   * the queue is asked again after a refusal and this row may leave it. */
  onRefusal: (message: string | null) => void;
};

export function RoleRequestDecision({ roleRequest, onRefusal }: RoleRequestDecisionProps) {
  const decide = useDecideRoleRequest(roleRequest.id);
  const [denying, setDenying] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  const reasonId = `deny-reason-${roleRequest.id}`;

  function send(decision: DecideRoleRequestRequest, form?: HTMLFormElement): void {
    onRefusal(null);
    decide.mutate(decision, {
      onError: (reason) => {
        const refused = refusalOf(problemWording, reason);
        setProblems(refused.problems);
        if (refused.message !== null) {
          onRefusal(refused.message);
          // Closed, so the refusal the queue shows is not hidden behind the dialog.
          setDenying(false);
        }
        if (form !== undefined) focusFirstProblem(form, refused.problems);
      },
    });
  }

  function stopDenying(): void {
    setDenying(false);
    setProblems({});
    onRefusal(null);
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
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={decide.isPending}
        onClick={() => send({ outcome: "granted" })}
      >
        Grant
      </Button>
      <Dialog open={denying} onOpenChange={(open) => (open ? setDenying(true) : stopDenying())}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={decide.isPending}>
            Deny
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deny the Role Request</DialogTitle>
            <DialogDescription>
              {roleRequest.viewer.email} asked for the {roleWording[roleRequest.role]} role. They
              are shown the reason you give.
            </DialogDescription>
          </DialogHeader>
          {/* The schema is the only check, so the browser's own validation must not answer
              first. */}
          <form noValidate onSubmit={deny} className="flex flex-col gap-4">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={stopDenying}>
                Cancel
              </Button>
              <Button type="submit" disabled={decide.isPending}>
                Send the denial
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
