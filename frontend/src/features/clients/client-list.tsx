import type { Client } from "@iqb/shared";
import type { ReactNode } from "react";
import { CreateClientForm } from "@/features/clients/create-client-form";
import { useEveryClient } from "@/features/clients/clients.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";

type ClientListProps = {
  /** Handed in by the console, so a Client does not have to know what is held against it. */
  detail: (client: Client) => ReactNode;
};

export function ClientList({ detail }: ClientListProps) {
  const clients = useEveryClient();

  return (
    <section className="flex flex-col gap-3" aria-labelledby="clients">
      <h2 id="clients" className="text-lg font-semibold">
        Clients
      </h2>
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
        <ul className="flex flex-col gap-4">
          {clients.data.map((client) => (
            <li key={client.id}>
              <section
                className="flex flex-col gap-2 rounded-md border p-4"
                aria-labelledby={`client-${client.id}`}
              >
                <h3 id={`client-${client.id}`} className="text-sm font-medium">
                  {client.name}
                </h3>
                {detail(client)}
              </section>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
