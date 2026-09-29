import {
  viewerRoles,
  viewerRoleSchema,
  type RoleRequest,
  type RoleRequestState,
  type ViewerRole,
} from "@iqb/shared";
import { useState } from "react";
import {
  useMyRoleRequests,
  useRaiseRoleRequest,
} from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { whatWentWrong } from "@/platform/api-client";
import { ActNotDone } from "@/ui/act-not-done";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";
import { Button } from "@/ui/shadcn/button";
import { NativeSelect, NativeSelectOption } from "@/ui/shadcn/native-select";

const whenWording = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const stateWording: Record<RoleRequestState, string> = {
  open: "It is waiting for an Administrator.",
  granted: "It was granted.",
  denied: "It was denied.",
};

export function MyRoleRequest({ heldRole }: { heldRole: ViewerRole }) {
  const mine = useMyRoleRequests();
  // Here and not in the form, so a refusal stays on screen when the answer hides the form.
  const raise = useRaiseRoleRequest();

  return (
    <section className="flex flex-col gap-3" aria-labelledby="my-role-request">
      <h2 id="my-role-request" className="text-lg font-semibold">
        Role Request
      </h2>
      {mine.isPending ? (
        <RowsLoading label="Loading your Role Requests…" rows={1} />
      ) : mine.isError ? (
        <ListNotLoaded
          what="Role Requests"
          reason={mine.error}
          onRetry={() => void mine.refetch()}
        />
      ) : (
        <MineLoaded latest={mine.data[0]} heldRole={heldRole} raise={raise} />
      )}
      {raise.isError && (
        <ActNotDone title="The Role Request was not sent." reason={whatWentWrong(raise.error)} />
      )}
    </section>
  );
}

type Raise = ReturnType<typeof useRaiseRoleRequest>;

type MineLoadedProps = {
  /** The newest of the Viewer's Role Requests, if they have raised one. */
  latest: RoleRequest | undefined;
  heldRole: ViewerRole;
  raise: Raise;
};

function MineLoaded({ latest, heldRole, raise }: MineLoadedProps) {
  return (
    <>
      {latest === undefined ? (
        <p className="text-muted-foreground text-sm">You have not asked for a different role.</p>
      ) : (
        <Latest roleRequest={latest} />
      )}
      {/* Hidden rather than offered, because the API refuses a second open one. */}
      {latest?.state !== "open" && <RaiseRoleRequest heldRole={heldRole} raise={raise} />}
    </>
  );
}

function Latest({ roleRequest }: { roleRequest: RoleRequest }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        You asked to be a {roleWording[roleRequest.role]} on{" "}
        <time dateTime={roleRequest.createdAt}>
          {whenWording.format(new Date(roleRequest.createdAt))}
        </time>
        .
      </p>
      <p>{stateWording[roleRequest.state]}</p>
      {roleRequest.state === "denied" && roleRequest.reason !== null && (
        <blockquote className="border-l-2 pl-3">{roleRequest.reason}</blockquote>
      )}
    </div>
  );
}

function RaiseRoleRequest({ heldRole, raise }: { heldRole: ViewerRole; raise: Raise }) {
  const others = viewerRoles.filter((role) => role !== heldRole);
  const [picked, setPicked] = useState<ViewerRole | null>(null);
  const role = picked ?? others[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="role-to-ask-for" className="text-sm">
        Role to ask for
      </label>
      <NativeSelect
        id="role-to-ask-for"
        size="sm"
        value={role}
        onChange={(event) => setPicked(viewerRoleSchema.parse(event.target.value))}
      >
        {others.map((each) => (
          <NativeSelectOption key={each} value={each}>
            {roleWording[each]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        size="sm"
        disabled={raise.isPending || role === undefined}
        onClick={() => role !== undefined && raise.mutate({ role })}
      >
        Ask for this role
      </Button>
    </div>
  );
}
