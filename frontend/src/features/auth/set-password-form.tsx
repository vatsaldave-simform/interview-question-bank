import { useState, type FormEvent } from "react";
import { setPasswordFormSchema, type SetPasswordForm } from "@/features/auth/auth.schema";
import { focusFirstProblem, problemsIn, type FieldProblems } from "@/features/auth/field-problems";
import { useSetPassword } from "@/features/auth/password-link.queries";
import { ApiFailure, whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";

const problemWording: Record<keyof SetPasswordForm, string> = {
  password: "Use at least 15 characters, and no more than 128.",
  repeated: "Type the same password again.",
};

type SetPasswordFormProps = {
  token: string;
  onSet: () => void;
  /** Handed the API's own words, because the page has nothing left to offer but a new link. */
  onLinkRefused: (message: string) => void;
};

/** A new password in, spending the link it was opened from. */
export function SetPasswordForm({ token, onSet, onLinkRefused }: SetPasswordFormProps) {
  const setPassword = useSetPassword();
  const [problems, setProblems] = useState<FieldProblems<keyof SetPasswordForm>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const typed = new FormData(form);
    const checked = setPasswordFormSchema.safeParse({
      password: typed.get("password"),
      repeated: typed.get("repeated"),
    });

    setRefusal(null);
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }

    setProblems({});
    setPassword.mutate(
      { token, password: checked.data.password },
      {
        onSuccess: onSet,
        onError: (reason) => {
          // Only a link that is expired, used or replaced is refused this way; a refused
          // password is `invalid_request`.
          if (reason instanceof ApiFailure && reason.code === "unauthenticated") {
            onLinkRefused(reason.message);
            return;
          }
          setRefusal(whatWentWrong(reason));
        },
      },
    );
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first.
    <form noValidate onSubmit={submit}>
      <FieldGroup>
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>The password was not set.</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={problems.password !== undefined}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={problems.password !== undefined}
            aria-describedby={
              problems.password === undefined ? "password-rule" : "password-problem"
            }
          />
          {problems.password === undefined ? (
            <FieldDescription id="password-rule">At least 15 characters.</FieldDescription>
          ) : (
            <FieldError id="password-problem">{problems.password}</FieldError>
          )}
        </Field>
        <Field data-invalid={problems.repeated !== undefined}>
          <FieldLabel htmlFor="repeated">The same password again</FieldLabel>
          <Input
            id="repeated"
            name="repeated"
            type="password"
            autoComplete="new-password"
            aria-invalid={problems.repeated !== undefined}
            aria-describedby={problems.repeated === undefined ? undefined : "repeated-problem"}
          />
          <FieldError id="repeated-problem">{problems.repeated}</FieldError>
        </Field>
        <Button type="submit" disabled={setPassword.isPending}>
          {setPassword.isPending ? "Setting…" : "Set my password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
