import {
  createViewerRequestSchema,
  viewerRoles,
  type CreateViewerRequest,
  type Viewer,
} from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { roleWording } from "@/features/viewers/role-wording";
import { useCreateViewer } from "@/features/viewers/viewers.queries";
import {
  focusFirstProblem,
  problemsIn,
  refusalOf,
  type FieldProblems,
} from "@/platform/field-problems";
import { ActNotDone } from "@/ui/act-not-done";
import { Button } from "@/ui/shadcn/button";
import { DialogFooter } from "@/ui/shadcn/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

type Problems = FieldProblems<keyof CreateViewerRequest>;

const problemWording: Record<keyof CreateViewerRequest, string> = {
  email: "Enter an email address, like author@iqb.test.",
  role: "Choose a role.",
};

type CreateViewerFormProps = {
  onCreated: (viewer: Viewer) => void;
  onCancel: () => void;
};

export function CreateViewerForm({ onCreated, onCancel }: CreateViewerFormProps) {
  const create = useCreateViewer();
  const [problems, setProblems] = useState<Problems>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const typed = new FormData(form);
    const checked = createViewerRequestSchema.safeParse({
      email: typed.get("email"),
      role: typed.get("role"),
    });

    setRefusal(null);
    if (!checked.success) {
      const found = problemsIn(problemWording, checked.error.issues);
      setProblems(found);
      focusFirstProblem(form, found);
      return;
    }

    setProblems({});
    create.mutate(checked.data, {
      onSuccess: ({ viewer }) => onCreated(viewer),
      onError: (reason) => {
        const refused = refusalOf(problemWording, reason);
        setProblems(refused.problems);
        setRefusal(refused.message);
        focusFirstProblem(form, refused.problems);
      },
    });
  }

  return (
    // The schema is the only check, so the browser's own validation must not answer first.
    <form noValidate onSubmit={submit} aria-label="Create a Viewer">
      <FieldGroup>
        {refusal !== null && <ActNotDone title="The Viewer was not created." reason={refusal} />}
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
