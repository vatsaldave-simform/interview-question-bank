import type { ReactNode } from "react";
import { useGrantedClients } from "@/features/clients/clients.queries";
import { whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldLabel } from "@/ui/shadcn/field";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";
import { Skeleton } from "@/ui/shadcn/skeleton";

type QuestionClientChoiceProps = {
  /** The chosen Client's id, or null for no restriction. */
  clientId: string | null;
  onChange: (clientId: string | null) => void;
  /** Shown after the dropdown, and only when there is one. */
  children?: ReactNode;
};

export function QuestionClientChoice(props: QuestionClientChoiceProps) {
  const { clientId, onChange, children } = props;
  const clients = useGrantedClients();
  if (clients.isPending) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your Clients…</span>
        <Skeleton className="bg-muted h-4 w-32" />
        <Skeleton className="bg-muted h-9 w-full" />
      </div>
    );
  }
  // Shown as an error, because a choice that quietly went missing would let an Author add a
  // Question they meant to restrict.
  if (clients.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Your Clients could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>Until they load, the Question cannot be restricted to a Client.</p>
          <p>{whatWentWrong(clients.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void clients.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  // With no Grant there is nothing to choose, and an empty list would look broken.
  if (clients.data.length === 0) return null;

  return (
    <Field>
      <FieldLabel htmlFor="question-client">Restrict to a Client</FieldLabel>
      <NativeSelect
        id="question-client"
        name="clientId"
        value={clientId ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <NativeSelectOption value="">No restriction</NativeSelectOption>
        {clients.data.map((client) => (
          <NativeSelectOption key={client.id} value={client.id}>
            {client.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {children}
    </Field>
  );
}
