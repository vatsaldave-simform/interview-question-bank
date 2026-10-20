import { Link } from "@tanstack/react-router";
import { useFirstOpenRoleRequests } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { dateWording } from "@/platform/when-wording";
import { cardRow, cardRowLink, cardRows } from "@/ui/card-rows";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowDetails } from "@/ui/row-details";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";
import { SectionLink } from "@/ui/section-link";

const shownOnHome = 5;

export function OpenRoleRequestsWaiting() {
  const open = useFirstOpenRoleRequests(shownOnHome);
  return (
    <ScreenSection
      id="open-role-requests-waiting"
      title="Open Role Requests"
      beside={<SectionLink to="/administration/role-requests">Decide them</SectionLink>}
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
        <ul className={cardRows}>
          {open.data.map((roleRequest) => (
            <li key={roleRequest.id} className={cardRow}>
              <Link to="/administration/role-requests" className={cardRowLink}>
                {roleRequest.viewer.email}
              </Link>
              <RowDetails>
                <p>
                  {roleWording[roleRequest.heldRole]} to {roleWording[roleRequest.role]}
                </p>
                <p>
                  Asked{" "}
                  <time dateTime={roleRequest.createdAt}>
                    {dateWording(roleRequest.createdAt)}
                  </time>
                </p>
              </RowDetails>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
