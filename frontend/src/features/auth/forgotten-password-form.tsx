import { passwordResetRequestSchema, type PasswordResetRequest } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { focusFirstProblem, problemsIn, type FieldProblems } from "@/platform/field-problems";
import { useAskForPasswordLink } from "@/features/auth/password-link.queries";
import { whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";

const problemWording: Record<keyof PasswordResetRequest, string> = {
  email: "Enter an email address, like author@iqb.test.",
};

/** An address in, and `onSent` once the API has taken it. */
export function ForgottenPasswordForm({ onSent }: { onSent: () => void }) {
  const ask = useAskForPasswordLink();
  const [problems, setProblems] = useState<FieldProblems<keyof PasswordResetRequest>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const checked = passwordResetRequestSchema.safeParse({
      email: new FormData(form).get("email"),
    });

    setRefusal(null);
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }

    setProblems({});
    ask.mutate(checked.data, {
      onSuccess: onSent,
      onError: (reason) => setRefusal(whatWentWrong(reason)),
    });
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first.
    <form noValidate onSubmit={submit}>
      <FieldGroup>
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>The link was not sent.</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={problems.email !== undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            aria-invalid={problems.email !== undefined}
            aria-describedby={problems.email === undefined ? undefined : "email-problem"}
          />
          <FieldError id="email-problem">{problems.email}</FieldError>
        </Field>
        <Button type="submit" disabled={ask.isPending}>
          {ask.isPending ? "Sending…" : "Email me a link"}
        </Button>
      </FieldGroup>
    </form>
  );
}
