import { useState } from "react";
import { RoleRequestDecision } from "@/features/role-requests/role-request-decision";
import { useOpenRoleRequests } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { ActNotDone } from "@/ui/act-not-done";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/shadcn/table";

const whenWording = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

type Refusal = { from: string; message: string };

export function RoleRequestQueue() {
  const roleRequests = useOpenRoleRequests();
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="open-role-requests">
      <PageHeader
        title="Open Role Requests"
        titleId="open-role-requests"
        description="Viewers asking for a different role, the one waiting longest first."
      />
      {refusal !== null && (
        <ActNotDone
          title={`The Role Request from ${refusal.from} was not decided.`}
          reason={refusal.message}
        />
      )}
      {roleRequests.isPending ? (
        <RowsLoading label="Loading the Role Requests…" />
      ) : roleRequests.isError ? (
        <ListNotLoaded
          what="Role Requests"
          reason={roleRequests.error}
          onRetry={() => void roleRequests.refetch()}
        />
      ) : roleRequests.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Role Request is waiting.</p>
      ) : (
        <Table aria-labelledby="open-role-requests">
          <TableHeader>
            <TableRow>
              <TableHead>Viewer</TableHead>
              <TableHead>Asked for</TableHead>
              <TableHead>Asked on</TableHead>
              <TableHead>Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roleRequests.data.map((roleRequest) => (
              <TableRow key={roleRequest.id}>
                <TableCell>{roleRequest.viewer.email}</TableCell>
                <TableCell>{roleWording[roleRequest.role]}</TableCell>
                <TableCell>
                  <time dateTime={roleRequest.createdAt}>
                    {whenWording.format(new Date(roleRequest.createdAt))}
                  </time>
                </TableCell>
                <TableCell>
                  <RoleRequestDecision
                    roleRequest={roleRequest}
                    onRefusal={(message) =>
                      setRefusal(
                        message === null ? null : { from: roleRequest.viewer.email, message },
                      )
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
