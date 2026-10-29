import type { Client } from "@iqb/shared";
import { Badge } from "@/ui/shadcn/badge";

export function QuestionClients({ clients }: { clients: readonly Client[] }) {
  if (clients.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Clients">
      {clients.map((client) => (
        <li key={client.id}>
          <Badge className="border-client-border bg-client text-client-foreground">
            {client.name}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
