import { createClientRequestSchema, type Client, type CreateClientRequest } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useCreateClient } from "@/features/clients/clients.queries";
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

type Problems = FieldProblems<keyof CreateClientRequest>;

const problemWording: Record<keyof CreateClientRequest, string> = {
  name: "Enter the Client's name, in 200 characters or fewer.",
};

type CreateClientFormProps = {
  onCreated: (client: Client) => void;
  onCancel: () => void;
};

export function CreateClientForm({ onCreated, onCancel }: CreateClientFormProps) {
  const create = useCreateClient();
  const [problems, setProblems] = useState<Problems>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const checked = createClientRequestSchema.safeParse({
      name: new FormData(form).get("name"),
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
      onSuccess: ({ client }) => onCreated(client),
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
    <form noValidate onSubmit={submit} aria-label="Create a Client">
      <FieldGroup>
        {refusal !== null && <ActNotDone title="The Client was not created." reason={refusal} />}
        <Field data-invalid={problems.name !== undefined}>
          <FieldLabel htmlFor="new-client-name">Name</FieldLabel>
          <Input
            id="new-client-name"
            name="name"
            autoComplete="off"
            aria-invalid={problems.name !== undefined}
            aria-describedby={problems.name === undefined ? undefined : "new-client-name-problem"}
          />
          <FieldError id="new-client-name-problem">{problems.name}</FieldError>
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
