import type { NamedViewer, PermissionGrant } from "@iqb/shared";
import { useState, type FormEvent } from "react";
import { useActOnGrants } from "@/features/permission-grants/permission-grants.queries";
import { useEveryViewer } from "@/features/viewers/viewers.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";
import { Button } from "@/ui/shadcn/button";
import { DialogFooter } from "@/ui/shadcn/dialog";
import { Field, FieldGroup, FieldLabel } from "@/ui/shadcn/field";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

type IssueGrantFormProps = {
  clientId: string;
  /** The Grants already held against the Client, whose Viewers are not offered again. */
  grants: PermissionGrant[];
  onIssued: (viewer: NamedViewer) => void;
  onCancel: () => void;
};

export function IssueGrantForm({ clientId, grants, onIssued, onCancel }: IssueGrantFormProps) {
  const viewers = useEveryViewer();
  // Its own, so a refusal shows here and not on the page behind the dialog.
  const issue = useActOnGrants(clientId);
  const [picked, setPicked] = useState("");

  if (viewers.isPending) return <RowsLoading label="Loading the Viewers…" rows={1} onCard />;
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

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pickedViewer === undefined) return;
    issue.mutate(
      { act: "issue", viewerId: pickedViewer.id },
      { onSuccess: () => onIssued(pickedViewer) },
    );
  }

  return (
    <form onSubmit={submit} aria-label="Issue a Permission Grant">
      <FieldGroup>
        {issue.isError && (
          <ActNotDone title="The Grant was not issued." reason={whatWentWrong(issue.error)} />
        )}
        <Field>
          <FieldLabel htmlFor={pickerId}>Viewer</FieldLabel>
          <NativeSelect
            id={pickerId}
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
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={issue.isPending || pickedViewer === undefined}>
            Issue the Grant
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}
