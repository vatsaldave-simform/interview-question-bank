import { createClientRequestSchema, type CreateClientRequest } from "@iqb/shared";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { Input } from "@/ui/shadcn/input";

type Problems = FieldProblems<keyof CreateClientRequest>;

const problemWording: Record<keyof CreateClientRequest, string> = {
  name: "Enter the Client's name, in 200 characters or fewer.",
};

export function CreateClientForm() {
  const create = useCreateClient();
  const [problems, setProblems] = useState<Problems>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    const checked = createClientRequestSchema.safeParse({
      name: new FormData(form).get("name"),
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
      onSuccess: ({ client }) => {
        form.reset();
        setCreated(client.name);
      },
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
    <form noValidate onSubmit={submit} aria-labelledby="create-client" className="max-w-md">
      <FieldGroup>
        <h3 id="create-client" className="text-sm font-medium">
          Create a Client
        </h3>
        {refusal !== null && <ActNotDone title="The Client was not created." reason={refusal} />}
        {created !== null && (
          <p role="status" className="text-sm">
            {created} was created.
          </p>
        )}
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
        <Button type="submit" className="self-start" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </FieldGroup>
    </form>
  );
}
