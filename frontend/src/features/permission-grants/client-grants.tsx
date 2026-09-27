import { useGrantsAgainst } from "@/features/permission-grants/permission-grants.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";

export function ClientGrants({ clientId }: { clientId: string }) {
  const grants = useGrantsAgainst(clientId);

  if (grants.isPending) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Loading the Grants…
      </p>
    );
  }
  if (grants.isError) {
    return (
      <ListNotLoaded what="Grants" reason={grants.error} onRetry={() => void grants.refetch()} />
    );
  }
  if (grants.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Nobody holds a Grant against this Client.</p>
    );
  }
  return (
    <ul aria-label="Viewers holding a Grant" className="flex flex-col gap-1 text-sm">
      {grants.data.map(({ viewer }) => (
        <li key={viewer.id}>{viewer.email}</li>
      ))}
    </ul>
  );
}
