import type { RoleRequest } from "@iqb/shared";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { RoleRequestDecision } from "@/features/role-requests/role-request-decision";
import { useOpenRoleRequests } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { dateWording } from "@/platform/when-wording";
import { ActNotDone } from "@/ui/act-not-done";
import { EmptyList } from "@/ui/empty-list";
import { ListCard } from "@/ui/list-card";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { PageHeader } from "@/ui/page-header";
import { RowDetails } from "@/ui/row-details";
import { RowsLoading } from "@/ui/rows-loading";
import { Badge } from "@/ui/shadcn/badge";
import { CardTitle } from "@/ui/shadcn/card";

type Refusal = { from: string; message: string };

export function RoleRequestQueue() {
  const roleRequests = useOpenRoleRequests();
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  return (
    <section className="flex flex-col gap-section" aria-labelledby="role-requests">
      <PageHeader
        title="Role Requests"
        titleId="role-requests"
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
        <EmptyList icon={UserPlusIcon} title="No Role Request is open">
          When a Viewer asks for a different role, it shows here for you to decide.
        </EmptyList>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Open Role Requests">
          {roleRequests.data.map((roleRequest) => (
            <li key={roleRequest.id}>
              <RoleRequestCard
                roleRequest={roleRequest}
                onRefusal={(message) =>
                  setRefusal(message === null ? null : { from: roleRequest.viewer.email, message })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type RoleRequestCardProps = {
  roleRequest: RoleRequest;
  onRefusal: (message: string | null) => void;
};

function RoleRequestCard({ roleRequest, onRefusal }: RoleRequestCardProps) {
  return (
    <article>
      <ListCard acts={<RoleRequestDecision roleRequest={roleRequest} onRefusal={onRefusal} />}>
        <CardTitle className="leading-snug">
          <h2>{roleRequest.viewer.email}</h2>
        </CardTitle>
        <RowDetails>
          <Badge className="bg-chip text-chip-foreground">
            {roleWording[roleRequest.heldRole]} to {roleWording[roleRequest.role]}
          </Badge>
          <p>
            Asked{" "}
            <time dateTime={roleRequest.createdAt}>{dateWording(roleRequest.createdAt)}</time>
          </p>
        </RowDetails>
      </ListCard>
    </article>
  );
}
