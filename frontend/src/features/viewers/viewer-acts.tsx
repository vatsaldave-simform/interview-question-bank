import { viewerRoles, viewerRoleSchema, type Viewer, type ViewerRole } from "@iqb/shared";
import { useState } from "react";
import { roleWording } from "@/features/viewers/role-wording";
import { useActOnViewer } from "@/features/viewers/viewers.queries";
import { whatWentWrong } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

export function ViewerActs({ viewer }: { viewer: Viewer }) {
  const act = useActOnViewer(viewer.id);
  // Null until one is picked, so the picker shows the role the API last sent.
  const [picked, setPicked] = useState<ViewerRole | null>(null);
  const role = picked ?? viewer.role;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          size="sm"
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
        <Button
          variant="outline"
          size="sm"
          disabled={act.isPending || role === viewer.role}
          onClick={() =>
            act.mutate({ act: "change-role", role }, { onSuccess: () => setPicked(null) })
          }
        >
          Change role
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={act.isPending}
          onClick={() => act.mutate({ act: viewer.isAdministrator ? "withdraw" : "appoint" })}
        >
          {viewer.isAdministrator ? "Withdraw Administrator" : "Appoint as Administrator"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={act.isPending}
          onClick={() => act.mutate({ act: viewer.isDeactivated ? "reactivate" : "deactivate" })}
        >
          {viewer.isDeactivated ? "Reactivate" : "Deactivate"}
        </Button>
      </div>
      {act.isError && (
        <Alert variant="destructive">
          <AlertTitle>That was not done.</AlertTitle>
          <AlertDescription>{whatWentWrong(act.error)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
