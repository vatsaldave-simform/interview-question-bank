import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { CreateClientForm } from "@/features/clients/create-client-form";
import { useEveryClient } from "@/features/clients/clients.queries";
import { AddDialog } from "@/ui/add-dialog";
import { DoneMessage } from "@/ui/done-message";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";

export function ClientList() {
  const clients = useEveryClient();
  // Here and not in the form, because the dialog closes once the Client is created.
  const [created, setCreated] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="clients">
      <PageHeader
        title="Clients"
        titleId="clients"
        description="Open a Client to see and change who holds a Grant against it."
        action={
          <AddDialog
            label="Add a Client"
            title="Create a Client"
            description="Questions can then be restricted to it."
            onOpen={() => setCreated(null)}
          >
            {(close) => (
              <CreateClientForm
                onCreated={(client) => {
                  close();
                  setCreated(client.name);
                }}
                onCancel={close}
              />
            )}
          </AddDialog>
        }
      />
      {created !== null && (
        <DoneMessage>{created} was created.</DoneMessage>
      )}
      {clients.isPending ? (
        <RowsLoading label="Loading the Clients…" />
      ) : clients.isError ? (
        <ListNotLoaded
          what="Clients"
          reason={clients.error}
          onRetry={() => void clients.refetch()}
        />
      ) : clients.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Client has been created.</p>
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
  );
}
