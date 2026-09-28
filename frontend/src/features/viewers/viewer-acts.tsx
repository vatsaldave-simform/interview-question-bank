import { viewerRoles, viewerRoleSchema, type Viewer, type ViewerRole } from "@iqb/shared";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { roleWording } from "@/features/viewers/role-wording";
import { useActOnViewer } from "@/features/viewers/viewers.queries";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { ConfirmAct } from "@/ui/confirm-act";
import { Button } from "@/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/shadcn/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/shadcn/dropdown-menu";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

export function ViewerActs({ viewer }: { viewer: Viewer }) {
  const act = useActOnViewer(viewer.id);
  const [changingRole, setChangingRole] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${viewer.email}`}
            disabled={act.isPending}
          >
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setChangingRole(true)}>Change role…</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => act.mutate({ act: viewer.isAdministrator ? "withdraw" : "appoint" })}
          >
            {viewer.isAdministrator ? "Withdraw Administrator" : "Appoint as Administrator"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {viewer.isDeactivated ? (
            <DropdownMenuItem onSelect={() => act.mutate({ act: "reactivate" })}>
              Reactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(true)}>
              Deactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* These are outside the menu, because what is inside the menu goes away as it closes. */}
      <Dialog open={changingRole} onOpenChange={setChangingRole}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {viewer.email} holds the {roleWording[viewer.role]} role now.
            </DialogDescription>
          </DialogHeader>
          <ChangeRoleForm viewer={viewer} onDone={() => setChangingRole(false)} />
        </DialogContent>
      </Dialog>
      <ConfirmAct
        open={deactivating}
        onOpenChange={setDeactivating}
        title={`Deactivate ${viewer.email}?`}
        description={
          "They can no longer log in. What they wrote stays in the bank, and you can " +
          "Reactivate them later."
        }
        act="Deactivate"
        onConfirm={() => act.mutate({ act: "deactivate" })}
      />
      {act.isError && <ActNotDone title="That was not done." reason={whatWentWrong(act.error)} />}
    </div>
  );
}

function ChangeRoleForm({ viewer, onDone }: { viewer: Viewer; onDone: () => void }) {
  // Its own, so a refusal shows here beside the picker and not on the row behind the dialog.
  const change = useActOnViewer(viewer.id);
  // Null until one is picked, so the picker shows the role the API last sent.
  const [picked, setPicked] = useState<ViewerRole | null>(null);
  const role = picked ?? viewer.role;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        change.mutate({ act: "change-role", role }, { onSuccess: onDone });
      }}
    >
      {change.isError && (
        <ActNotDone title="The role was not changed." reason={whatWentWrong(change.error)} />
      )}
      <NativeSelect
        aria-label={`Role for ${viewer.email}`}
        value={role}
        onChange={(event) => setPicked(viewerRoleSchema.parse(event.target.value))}
      >
        {viewerRoles.map((each) => (
          <NativeSelectOption key={each} value={each}>
            {roleWording[each]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={change.isPending || role === viewer.role}>
          Change role
        </Button>
      </DialogFooter>
    </form>
  );
}
