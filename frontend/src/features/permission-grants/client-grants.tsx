import type { PermissionGrant } from "@iqb/shared";
import { useState } from "react";
import {
  useActOnGrants,
  useGrantsAgainst,
} from "@/features/permission-grants/permission-grants.queries";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { Button } from "@/ui/shadcn/button";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

export function ClientGrants({ clientId }: { clientId: string }) {
  const grants = useGrantsAgainst(clientId);
  const act = useActOnGrants(clientId);

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
  return (
    <div className="flex flex-col gap-3">
      {grants.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody holds a Grant against this Client.</p>
      ) : (
        <ul aria-label="Viewers holding a Grant" className="flex flex-col gap-1 text-sm">
          {grants.data.map(({ viewer }) => (
            <li key={viewer.id} className="flex items-center gap-2">
              <span>{viewer.email}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={act.isPending}
                onClick={() => act.mutate({ act: "revoke", viewerId: viewer.id })}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      <IssueGrant
        clientId={clientId}
        grants={grants.data}
        pending={act.isPending}
        onIssue={(viewerId, done) => act.mutate({ act: "issue", viewerId }, { onSuccess: done })}
      />
      {act.isError && <ActNotDone title="That was not done." reason={whatWentWrong(act.error)} />}
    </div>
  );
}

type IssueGrantProps = {
  clientId: string;
  grants: PermissionGrant[];
  pending: boolean;
  onIssue: (viewerId: string, done: () => void) => void;
};

function IssueGrant({ clientId, grants, pending, onIssue }: IssueGrantProps) {
  const viewers = useEveryViewer();
  const [picked, setPicked] = useState("");

  // The Viewer list reports its own failure in the section above.
  if (!viewers.isSuccess) return null;
  // Not a rule about who may hold a Grant: it leaves out only those the API says hold one.
  const withoutGrant = viewers.data.filter(
    (viewer) => !grants.some((grant) => grant.viewer.id === viewer.id),
  );
  const pickerId = `grant-viewer-${clientId}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={pickerId} className="text-sm">
        Viewer
      </label>
      <NativeSelect
        id={pickerId}
        size="sm"
        value={picked}
        onChange={(event) => setPicked(event.target.value)}
      >
        <NativeSelectOption value="">Choose a Viewer</NativeSelectOption>
        {withoutGrant.map((viewer) => (
          <NativeSelectOption key={viewer.id} value={viewer.id}>
            {viewer.email}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        size="sm"
        disabled={pending || picked === ""}
        onClick={() => onIssue(picked, () => setPicked(""))}
      >
        Issue a Grant
      </Button>
    </div>
  );
}
