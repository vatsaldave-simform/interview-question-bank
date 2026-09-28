import { CreateViewerForm } from "@/features/viewers/create-viewer-form";
import { roleWording } from "@/features/viewers/role-wording";
import { ViewerActs } from "@/features/viewers/viewer-acts";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
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

  return (
    <section className="flex flex-col gap-6" aria-labelledby="viewers">
      <PageHeader
        title="Viewers"
        titleId="viewers"
        description="Everyone who can log in, or could before they were Deactivated."
      />
      <CreateViewerForm />
      {viewers.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading the Viewers…
        </p>
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
              <TableHead>Actions</TableHead>
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
