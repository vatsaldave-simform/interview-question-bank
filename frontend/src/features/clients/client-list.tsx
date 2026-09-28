import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { CreateClientForm } from "@/features/clients/create-client-form";
import { useEveryClient } from "@/features/clients/clients.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";

export function ClientList() {
  const clients = useEveryClient();

  return (
    <section className="flex flex-col gap-6" aria-labelledby="clients">
      <PageHeader
        title="Clients"
        titleId="clients"
        description="Open a Client to see and change who holds a Grant against it."
      />
      <CreateClientForm />
      {clients.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading the Clients…
        </p>
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
