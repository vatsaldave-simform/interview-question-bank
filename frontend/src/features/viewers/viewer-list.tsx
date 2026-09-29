import { useState } from "react";
import { CreateViewerForm } from "@/features/viewers/create-viewer-form";
import { roleWording } from "@/features/viewers/role-wording";
import { ViewerActs } from "@/features/viewers/viewer-acts";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { AddDialog } from "@/ui/add-dialog";
import { DoneMessage } from "@/ui/done-message";
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

export function ViewerList() {
  const viewers = useEveryViewer();
  // Here and not in the form, because the dialog closes once the Viewer is created.
  const [created, setCreated] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="viewers">
      <PageHeader
        title="Viewers"
        titleId="viewers"
        description="Everyone who can log in, or could before they were Deactivated."
        action={
          <AddDialog
            label="Add a Viewer"
            title="Create a Viewer"
            description="They are emailed a link to set their password."
            onOpen={() => setCreated(null)}
          >
            {(close) => (
              <CreateViewerForm
                onCreated={(viewer) => {
                  close();
                  setCreated(viewer.email);
                }}
                onCancel={close}
              />
            )}
          </AddDialog>
        }
      />
      {created !== null && (
        <DoneMessage>
          {created} was created, and was emailed a link to set their password.
        </DoneMessage>
      )}
      {viewers.isPending ? (
        <RowsLoading label="Loading the Viewers…" />
      ) : viewers.isError ? (
        <ListNotLoaded
          what="Viewers"
          reason={viewers.error}
          onRetry={() => void viewers.refetch()}
        />
      ) : (
        <Table aria-labelledby="viewers">
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Administrator</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {viewers.data.map((viewer) => (
              <TableRow key={viewer.id}>
                <TableCell>{viewer.email}</TableCell>
                <TableCell>{roleWording[viewer.role]}</TableCell>
                <TableCell>{viewer.isAdministrator ? "Yes" : "No"}</TableCell>
                <TableCell className={viewer.isDeactivated ? "text-muted-foreground" : ""}>
                  {viewer.isDeactivated ? "Deactivated" : "Active"}
                </TableCell>
                <TableCell>
                  <ViewerActs viewer={viewer} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
