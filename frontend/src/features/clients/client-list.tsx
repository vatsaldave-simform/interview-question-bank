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

export function ClientList() {
  const clients = useEveryClient();
  const addAClient = <AddDialogButton label="Add a Client" />;

  return (
    <AddDialog
      title="Create a Client"
      description="Questions can then be restricted to it."
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
      <section className="flex flex-col gap-6" aria-labelledby="clients">
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
            Add a Client, and Questions can then be restricted to it.
          </EmptyList>
        ) : (
          <ul aria-labelledby="clients" className="bg-card divide-y rounded-md border">
            {clients.data.map((client) => (
              <li key={client.id}>
                {/* A link to the Client's page, so its Grants are asked for only when opened. */}
                <Link
                  to="/administration/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="hover:bg-accent flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium"
                >
                  {client.name}
                  <ChevronRightIcon aria-hidden="true" className="text-muted-foreground size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AddDialog>
  );
}
