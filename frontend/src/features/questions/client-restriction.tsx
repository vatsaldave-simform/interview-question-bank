import type { Client } from "@iqb/shared";
import { LockIcon } from "lucide-react";
import { Badge } from "@/ui/shadcn/badge";

export function ClientRestriction({ client }: { client: Client | null }) {
  if (client === null) return null;
  return (
    <Badge className="bg-restricted text-restricted-foreground">
      <LockIcon aria-hidden="true" />
      {`Restricted to ${client.name}`}
    </Badge>
  );
}
