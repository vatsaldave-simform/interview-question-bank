import { Link } from "@tanstack/react-router";
import { useFirstOpenRoleRequests } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { dateWording } from "@/platform/when-wording";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";

const shownOnHome = 5;

export function OpenRoleRequestsWaiting() {
  const open = useFirstOpenRoleRequests(shownOnHome);
  return (
    <ScreenSection
      id="open-role-requests-waiting"
      title="Open Role Requests"
      beside={
        <Link
          to="/administration/role-requests"
          className="text-primary ml-auto text-sm hover:underline"
        >
          Decide them
        </Link>
      }
    >
      {open.isPending ? (
        <RowsLoading label="Loading the Role Requests…" rows={shownOnHome} onCard />
      ) : open.isError ? (
        <ListNotLoaded
          what="Role Requests"
          reason={open.error}
          onRetry={() => void open.refetch()}
        />
      ) : open.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No Role Request is open. Nobody is waiting on you.
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {open.data.map((roleRequest) => (
            <li key={roleRequest.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <p className="font-medium">{roleRequest.viewer.email}</p>
              <p className="text-muted-foreground text-sm">
                Asks for {roleWording[roleRequest.role]} since{" "}
                <time dateTime={roleRequest.createdAt}>
                  {dateWording(roleRequest.createdAt)}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
