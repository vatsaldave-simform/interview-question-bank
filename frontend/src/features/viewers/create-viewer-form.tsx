import {
  createViewerRequestSchema,
  refusedFieldsSchema,
  viewerRoles,
  type CreateViewerRequest,
  type ViewerRole,
} from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useCreateViewer } from "@/features/viewers/viewers.queries";
import { ApiFailure, whatWentWrong } from "@/platform/api-client";
import { focusFirstProblem, problemsIn, type FieldProblems } from "@/platform/field-problems";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

type Problems = FieldProblems<keyof CreateViewerRequest>;

const problemWording: Record<keyof CreateViewerRequest, string> = {
  email: "Enter an email address, like author@iqb.test.",
  role: "Choose a role.",
};

const roleWording: Record<ViewerRole, string> = {
  reader: "Reader",
  author: "Author",
  reviewer: "Reviewer",
};

function refusalOf(reason: Error): { problems: Problems; message: string | null } {
  if (reason instanceof ApiFailure && reason.code === "invalid_request") {
    const refused = refusedFieldsSchema.safeParse(reason.details);
    if (refused.success) {
      const named = Object.keys(refused.data.properties).map((field) => ({ path: [field] }));
      const problems = problemsIn(problemWording, named);
      if (Object.keys(problems).length > 0) return { problems, message: null };
    }
  }
  return { problems: {}, message: whatWentWrong(reason) };
}

export function CreateViewerForm() {
  const create = useCreateViewer();
  const [problems, setProblems] = useState<Problems>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const typed = new FormData(form);
    const checked = createViewerRequestSchema.safeParse({
      email: typed.get("email"),
      role: typed.get("role"),
    });

    setRefusal(null);
    setCreated(null);
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }

    setProblems({});
    create.mutate(checked.data, {
      onSuccess: ({ viewer }) => {
        form.reset();
        setCreated(viewer.email);
      },
      onError: (reason) => {
        const refused = refusalOf(reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
        focusFirstProblem(form, refused.problems);
      },
    });
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first.
    <form noValidate onSubmit={submit} aria-labelledby="create-viewer" className="max-w-md">
      <FieldGroup>
        <h3 id="create-viewer" className="text-sm font-medium">
          Create a Viewer
        </h3>
        {refusal !== null && (
          <Alert variant="destructive">
            <AlertTitle>The Viewer was not created.</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}
        {created !== null && (
          <p role="status" className="text-sm">
            {created} was created, and was emailed a link to set their password.
          </p>
        )}
        <Field data-invalid={problems.email !== undefined}>
          <FieldLabel htmlFor="new-viewer-email">Email</FieldLabel>
          <Input
            id="new-viewer-email"
            name="email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={problems.email !== undefined}
            aria-describedby={problems.email === undefined ? undefined : "new-viewer-email-problem"}
          />
          <FieldError id="new-viewer-email-problem">{problems.email}</FieldError>
        </Field>
        <Field data-invalid={problems.role !== undefined}>
          <FieldLabel htmlFor="new-viewer-role">Role</FieldLabel>
          <NativeSelect
            id="new-viewer-role"
            name="role"
            aria-invalid={problems.role !== undefined}
            aria-describedby={problems.role === undefined ? undefined : "new-viewer-role-problem"}
          >
            {viewerRoles.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {roleWording[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="new-viewer-role-problem">{problems.role}</FieldError>
        </Field>
        <Button type="submit" className="self-start" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </FieldGroup>
    </form>
  );
}
