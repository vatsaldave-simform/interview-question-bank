import { loginRequestSchema, type LoginRequest } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { focusFirstProblem, problemsIn, type FieldProblems } from "@/platform/field-problems";
import { signIn } from "@/features/auth/sign-in";
import { ApiFailure } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";

const problemWording: Record<keyof LoginRequest, string> = {
  email: "Enter an email address, like author@iqb.test.",
  password: "Enter your password.",
};

/** Credentials in, a session out, and whatever the API refused shown in its own words. */
export function LoginForm() {
  const [problems, setProblems] = useState<FieldProblems<keyof LoginRequest>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Held before anything is awaited: React empties the event's own reference to the
    // form once the handler yields.
    const form = event.currentTarget;
    const typed = new FormData(form);
    const checked = loginRequestSchema.safeParse({
      email: typed.get("email"),
      password: typed.get("password"),
    });

    setRefusal(null);
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }

    setProblems({});
    setSending(true);
    try {
      await signIn(checked.data);
    } catch (reason) {
      // Anything that is not the API refusing means it answered in a shape this client
      // does not know, and a form that quietly stops is worse than saying so (ADR-0010).
      setRefusal(
        reason instanceof ApiFailure
          ? reason.message
          : "The bank answered, but not in a way this client understands.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first
    // and refuse something the schema would have accepted.
    <form noValidate onSubmit={(event) => void submit(event)}>
      <FieldGroup>
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>That sign-in did not work.</AlertTitle>
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
        <Field data-invalid={problems.password !== undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={problems.password !== undefined}
            aria-describedby={problems.password === undefined ? undefined : "password-problem"}
          />
          <FieldError id="password-problem">{problems.password}</FieldError>
        </Field>
        <Button type="submit" disabled={sending}>
          {sending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
