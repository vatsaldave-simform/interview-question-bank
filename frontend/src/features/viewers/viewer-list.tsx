import { UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { CreateViewerForm } from "@/features/viewers/create-viewer-form";
import { roleWording } from "@/features/viewers/role-wording";
import { ViewerActs } from "@/features/viewers/viewer-acts";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { AddDialog, AddDialogButton } from "@/ui/add-dialog";
import { EmptyList } from "@/ui/empty-list";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowsLoading } from "@/ui/rows-loading";
import { Badge } from "@/ui/shadcn/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/shadcn/table";
import { ColumnHead, TableCard } from "@/ui/table-card";

export function ViewerList() {
  const viewers = useEveryViewer();
  const addAViewer = <AddDialogButton label="Add a Viewer" />;

  return (
    <AddDialog
      title="Create a Viewer"
      description="They are emailed a link to set their password."
      form={(close) => (
        <CreateViewerForm
          onCreated={(viewer) => {
            close();
            toast.success(
              `${viewer.email} was created, and was emailed a link to set their password.`,
            );
          }}
          onCancel={close}
        />
      )}
    >
      <section className="flex flex-col gap-section" aria-labelledby="viewers">
        <PageHeader
          title="Viewers"
          titleId="viewers"
          description="Everyone who can log in, or could before they were Deactivated."
          // An empty list offers it in its place.
          action={viewers.data?.length === 0 ? undefined : addAViewer}
        />
        {viewers.isPending ? (
          <RowsLoading label="Loading the Viewers…" />
        ) : viewers.isError ? (
          <ListNotLoaded
            what="Viewers"
            reason={viewers.error}
            onRetry={() => void viewers.refetch()}
          />
        ) : viewers.data.length === 0 ? (
          <EmptyList icon={UsersIcon} title="Nobody can log in yet" action={addAViewer}>
            Add a Viewer, and they are emailed a link to set their password.
          </EmptyList>
        ) : (
          <TableCard>
            <Table aria-labelledby="viewers">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ColumnHead>Email</ColumnHead>
                  <ColumnHead>Role</ColumnHead>
                  <ColumnHead>Administrator</ColumnHead>
                  <ColumnHead>State</ColumnHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewers.data.map((viewer) => (
                  <TableRow key={viewer.id}>
                    <TableCell className="p-3">{viewer.email}</TableCell>
                    <TableCell className="p-3">{roleWording[viewer.role]}</TableCell>
                    <TableCell className="p-3">{viewer.isAdministrator ? "Yes" : "No"}</TableCell>
                    <TableCell className="p-3">
                      {viewer.isDeactivated ? (
                        <Badge className="bg-rejected text-rejected-foreground border-transparent">
                          Deactivated
                        </Badge>
                      ) : (
                        "Active"
                      )}
                    </TableCell>
                    <TableCell className="p-3">
                      <ViewerActs viewer={viewer} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>
    </AddDialog>
  );
}
