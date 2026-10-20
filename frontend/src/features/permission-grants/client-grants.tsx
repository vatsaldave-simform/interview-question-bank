import type { NamedViewer, PermissionGrant } from "@iqb/shared";
import { LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useEveryClient } from "@/features/clients/clients.queries";
import {
  useActOnGrants,
  useGrantsAgainst,
} from "@/features/permission-grants/permission-grants.queries";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { ConfirmAct } from "@/ui/confirm-act";
import { EmptyList } from "@/ui/empty-list";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";
import { Button } from "@/ui/shadcn/button";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

export function ClientGrants({ clientId }: { clientId: string }) {
  // The API has no address for one Client, so the name comes from the list of them all.
  const clients = useEveryClient();
  const name = clients.data?.find(({ id }) => id === clientId)?.name ?? "Client";

  return (
    <section className="flex flex-col gap-section" aria-labelledby="client">
      <PageHeader
        title={name}
        titleId="client"
        description="The Viewers who may see the Questions restricted to this Client."
        trail={{
          back: [{ name: "Administration", link: { to: "/administration" } }, { page: "clients" }],
          here: name,
        }}
      />
      <GrantsAgainst clientId={clientId} />
    </section>
  );
}

function GrantsAgainst({ clientId }: { clientId: string }) {
  const grants = useGrantsAgainst(clientId);
  const act = useActOnGrants(clientId);
  // Kept after the confirmation closes, so its words stay right while it fades out.
  const [toRevoke, setToRevoke] = useState<NamedViewer | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (grants.isPending) {
    return <RowsLoading label="Loading the Grants…" />;
  }
  if (grants.isError) {
    return (
      <ListNotLoaded what="Grants" reason={grants.error} onRetry={() => void grants.refetch()} />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {grants.data.length === 0 ? (
        <EmptyList icon={LockIcon} title="Nobody can see this Client's Questions yet">
          Questions restricted to this Client stay hidden until you give a Viewer a Permission
          Grant for it, below.
        </EmptyList>
      ) : (
        <ul aria-label="Viewers holding a Grant" className="flex flex-col gap-1 text-sm">
          {grants.data.map(({ viewer }) => (
            <li key={viewer.id} className="flex items-center gap-2">
              <span>{viewer.email}</span>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={act.isPending}
                onClick={() => {
                  setToRevoke(viewer);
                  setConfirming(true);
                }}
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
        onIssue={(viewer, done) =>
          act.mutate(
            { act: "issue", viewerId: viewer.id },
            {
              onSuccess: () => {
                done();
                toast.success(`${viewer.email} now holds a Grant against this Client.`);
              },
            },
          )
        }
      />
      {act.isError && <ActNotDone title="That was not done." reason={whatWentWrong(act.error)} />}
      <ConfirmAct
        open={confirming}
        onOpenChange={setConfirming}
        title="Revoke the Grant?"
        description={`${toRevoke?.email} can no longer see this Client's Questions.`}
        act="Revoke"
        onConfirm={() =>
          toRevoke !== null &&
          act.mutate(
            { act: "revoke", viewerId: toRevoke.id },
            { onSuccess: () => toast.success(`${toRevoke.email}'s Grant was revoked.`) },
          )
        }
      />
    </div>
  );
}

type IssueGrantProps = {
  clientId: string;
  grants: PermissionGrant[];
  pending: boolean;
  onIssue: (viewer: NamedViewer, done: () => void) => void;
};

function IssueGrant({ clientId, grants, pending, onIssue }: IssueGrantProps) {
  const viewers = useEveryViewer();
  const [picked, setPicked] = useState("");

  if (viewers.isPending) return null;
  // Said here, because the Viewer list is on a page of its own.
  if (viewers.isError) {
    return (
      <ListNotLoaded what="Viewers" reason={viewers.error} onRetry={() => void viewers.refetch()} />
    );
  }
  // Not a rule about who may hold a Grant: it leaves out only those the API says hold one.
  const withoutGrant = viewers.data.filter(
    (viewer) => !grants.some((grant) => grant.viewer.id === viewer.id),
  );
  const pickedViewer = withoutGrant.find((viewer) => viewer.id === picked);
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
        disabled={pending || pickedViewer === undefined}
        onClick={() => pickedViewer !== undefined && onIssue(pickedViewer, () => setPicked(""))}
      >
        Issue a Grant
      </Button>
    </div>
  );
}
