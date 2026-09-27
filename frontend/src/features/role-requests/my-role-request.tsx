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

  return (
    <section className="flex flex-col gap-3" aria-labelledby="my-role-request">
      <h2 id="my-role-request" className="font-medium">
        Role Request
      </h2>
      {mine.isPending ? (
        <p role="status" className="text-muted-foreground text-sm">
          Loading your Role Requests…
        </p>
      ) : mine.isError ? (
        <ListNotLoaded
          what="Role Requests"
          reason={mine.error}
          onRetry={() => void mine.refetch()}
        />
      ) : (
        <>
          {mine.data[0] === undefined ? (
            <p className="text-muted-foreground text-sm">
              You have not asked for a different role.
            </p>
          ) : (
            <Latest roleRequest={mine.data[0]} />
          )}
          {/* The API refuses a second open one anyway; this only leaves out a form it would
              refuse (ADR-0041). */}
          {mine.data[0]?.state !== "open" && <RaiseRoleRequest heldRole={heldRole} />}
        </>
      )}
    </section>
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

function RaiseRoleRequest({ heldRole }: { heldRole: ViewerRole }) {
  const raise = useRaiseRoleRequest();
  const others = viewerRoles.filter((role) => role !== heldRole);
  const [picked, setPicked] = useState<ViewerRole | null>(null);
  const role = picked ?? others[0];

  return (
    <div className="flex flex-col gap-2">
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
      {raise.isError && (
        <ActNotDone title="The Role Request was not sent." reason={whatWentWrong(raise.error)} />
      )}
    </div>
  );
}
