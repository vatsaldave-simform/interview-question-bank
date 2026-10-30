import type { Client } from "@iqb/shared";
import { useClients } from "@/features/clients/clients.queries";
import { whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Checkbox } from "@/ui/shadcn/checkbox";
import { FieldDescription, FieldLegend, FieldSet } from "@/ui/shadcn/field";
import { Skeleton } from "@/ui/shadcn/skeleton";

type ClientsFieldProps = {
  /** The chosen Clients' ids. */
  chosen: readonly string[];
  onChange: (clientIds: string[]) => void;
};

export function ClientsField({ chosen, onChange }: ClientsFieldProps) {
  const clients = useClients();
  if (clients.isPending) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading the Clients…</span>
        <Skeleton className="bg-muted h-4 w-32" />
        <Skeleton className="bg-muted h-9 w-full" />
      </div>
    );
  }
  // Shown as an error, because a choice that quietly went missing would let a Question be
  // saved without the Clients someone meant to name.
  if (clients.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The Clients could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>Until they load, the Question's Clients cannot be chosen.</p>
          <p>{whatWentWrong(clients.error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void clients.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  // With no Client there is nothing to choose, and an empty list would look broken.
  if (clients.data.length === 0) return null;

  return <KnownClientsField clients={clients.data} chosen={chosen} onChange={onChange} />;
}

function KnownClientsField({
  clients,
  chosen,
  onChange,
}: ClientsFieldProps & { clients: readonly Client[] }) {
  function toggle(id: string, checked: boolean): void {
    onChange(checked ? [...chosen, id] : chosen.filter((one) => one !== id));
  }

  return (
    <FieldSet>
      <FieldLegend>Clients</FieldLegend>
      <FieldDescription>The Clients that have asked this Question in their interviews.</FieldDescription>
      <div className="flex flex-wrap gap-2">
        {clients.map((client) => {
          const id = `question-client-${client.id}`;
          return (
            <label
              key={client.id}
              htmlFor={id}
              className="border-(--field-line) bg-(--field) has-focus-visible:ring-ring/50 has-data-[state=checked]:border-ring inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium has-focus-visible:ring-[3px]"
            >
              <Checkbox
                id={id}
                checked={chosen.includes(client.id)}
                onCheckedChange={(checked) => toggle(client.id, checked === true)}
              />
              {client.name}
            </label>
          );
        })}
      </div>
    </FieldSet>
  );
}
