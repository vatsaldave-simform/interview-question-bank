import { Link } from "@tanstack/react-router";
import { Building2Icon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { CreateClientForm } from "@/features/clients/create-client-form";
import { useEveryClient } from "@/features/clients/clients.queries";
import { AddDialog, AddDialogButton } from "@/ui/add-dialog";
import { EmptyList } from "@/ui/empty-list";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";
import { Card, CardTitle } from "@/ui/shadcn/card";

/** Up to two letters for the square beside the name, as in "NL" for Northwind Logistics. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ClientList() {
  const clients = useEveryClient();
  const addAClient = <AddDialogButton label="Add a Client" />;

  return (
    <AddDialog
      title="Create a Client"
      description="Questions can then name it."
      form={(close) => (
        <CreateClientForm
          onCreated={(client) => {
            close();
            toast.success(`${client.name} was created.`);
          }}
          onCancel={close}
        />
      )}
    >
      <section className="flex flex-col gap-section" aria-labelledby="clients">
        <PageHeader
          title="Clients"
          titleId="clients"
          description="Open a Client to see and change who holds a Permission Grant for it."
          // An empty list offers it in its place.
          action={clients.data?.length === 0 ? undefined : addAClient}
        />
        {clients.isPending ? (
          <RowsLoading label="Loading the Clients…" />
        ) : clients.isError ? (
          <ListNotLoaded
            what="Clients"
            reason={clients.error}
            onRetry={() => void clients.refetch()}
          />
        ) : clients.data.length === 0 ? (
          <EmptyList icon={Building2Icon} title="No Client yet" action={addAClient}>
            Add a Client, and Questions can then name it.
          </EmptyList>
        ) : (
          <ul
            aria-labelledby="clients"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3.5"
          >
            {clients.data.map((client) => (
              <li key={client.id}>
                <Card className="flex-row items-center gap-3.5 p-(--spacing-panel)">
                  <span
                    aria-hidden="true"
                    className="bg-brand-deep text-brand-tint grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold"
                  >
                    {initialsOf(client.name)}
                  </span>
                  <CardTitle className="min-w-0 flex-1 leading-snug">
                    {/* A link to the Client's page, so its Grants are asked for only when opened. */}
                    <Link
                      to="/administration/clients/$clientId"
                      params={{ clientId: client.id }}
                      className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                    >
                      {client.name}
                    </Link>
                  </CardTitle>
                  <ChevronRightIcon aria-hidden="true" className="text-muted-foreground size-4.5" />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AddDialog>
  );
}
