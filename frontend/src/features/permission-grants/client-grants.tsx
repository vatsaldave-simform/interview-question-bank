import type { NamedViewer, PermissionGrant } from "@iqb/shared";
import { LockIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useEveryClient } from "@/features/clients/clients.queries";
import { IssueGrantForm } from "@/features/permission-grants/issue-grant-form";
import {
  useActOnGrants,
  useGrantsAgainst,
} from "@/features/permission-grants/permission-grants.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { AddDialog, AddDialogButton } from "@/ui/add-dialog";
import { ConfirmAct } from "@/ui/confirm-act";
import { EmptyList } from "@/ui/empty-list";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";
import { Button } from "@/ui/shadcn/button";
import {
  Table,
  TableBody,
  TableHead,
  TableRow,
} from "@/ui/shadcn/table";
import { Cell, ColumnHead, ColumnHeads, TableCard } from "@/ui/table-card";

export function ClientGrants({ clientId }: { clientId: string }) {
  // The API has no address for one Client, so the name comes from the list of them all.
  const clients = useEveryClient();
  const name = clients.data?.find(({ id }) => id === clientId)?.name ?? "Client";
  const grants = useGrantsAgainst(clientId);
  const issueAGrant = <AddDialogButton label="Issue a Permission Grant" />;

  return (
    <AddDialog
      title="Issue a Permission Grant"
      description="The Viewer can then see every Question restricted to this Client."
      form={(close) => (
        <IssueGrantForm
          clientId={clientId}
          grants={grants.data ?? []}
          onIssued={(viewer) => {
            close();
            toast.success(`${viewer.email} now holds a Grant against this Client.`);
          }}
          onCancel={close}
        />
      )}
    >
      <section className="flex flex-col gap-section" aria-labelledby="client">
        <PageHeader
          title={name}
          titleId="client"
          description="The Viewers who may see the Questions restricted to this Client."
          trail={{
            back: [{ name: "Administration", link: { to: "/administration" } }, { page: "clients" }],
            here: name,
          }}
          // Shown only once the Grants are loaded, so the dialog never offers a Viewer who holds
          // one; an empty list shows its own button instead.
          action={grants.isSuccess && grants.data.length > 0 ? issueAGrant : undefined}
        />
        <section className="flex flex-col gap-3" aria-labelledby="permission-grants">
          <h2 id="permission-grants" className="text-base font-semibold">
            Permission Grants
          </h2>
          {grants.isPending ? (
            <RowsLoading label="Loading the Grants…" />
          ) : grants.isError ? (
            <ListNotLoaded
              what="Grants"
              reason={grants.error}
              onRetry={() => void grants.refetch()}
            />
          ) : (
            <GrantsAgainst clientId={clientId} grants={grants.data} issueAGrant={issueAGrant} />
          )}
        </section>
      </section>
    </AddDialog>
  );
}

type GrantsAgainstProps = {
  clientId: string;
  grants: PermissionGrant[];
  issueAGrant: ReactNode;
};

function GrantsAgainst({ clientId, grants, issueAGrant }: GrantsAgainstProps) {
  const revoke = useActOnGrants(clientId);
  // Kept after the confirmation closes, so its words stay right while it fades out.
  const [toRevoke, setToRevoke] = useState<NamedViewer | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {revoke.isError && (
        <ActNotDone
          title="The Permission Grant was not revoked."
          reason={whatWentWrong(revoke.error)}
        />
      )}
      {grants.length === 0 ? (
        <EmptyList
          icon={LockIcon}
          title="Nobody can see this Client's Questions yet"
          action={issueAGrant}
        >
          Questions restricted to this Client stay hidden until you issue a Viewer a Permission
          Grant for it.
        </EmptyList>
      ) : (
        <TableCard>
          <Table aria-labelledby="permission-grants">
            <ColumnHeads>
              <ColumnHead>Viewer</ColumnHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </ColumnHeads>
            <TableBody>
              {grants.map(({ viewer }) => (
                <TableRow key={viewer.id}>
                  <Cell>{viewer.email}</Cell>
                  <Cell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => {
                        setToRevoke(viewer);
                        setConfirming(true);
                      }}
                    >
                      Revoke
                    </Button>
                  </Cell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      <ConfirmAct
        open={confirming}
        onOpenChange={setConfirming}
        title="Revoke the Grant?"
        description={`${toRevoke?.email} can no longer see this Client's Questions.`}
        act="Revoke"
        onConfirm={() =>
          toRevoke !== null &&
          revoke.mutate(
            { act: "revoke", viewerId: toRevoke.id },
            { onSuccess: () => toast.success(`${toRevoke.email}'s Grant was revoked.`) },
          )
        }
      />
    </>
  );
}
