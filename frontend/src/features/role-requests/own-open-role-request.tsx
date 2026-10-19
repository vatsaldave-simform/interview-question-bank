import { Link } from "@tanstack/react-router";
import { useMyOpenRoleRequest } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { ScreenSection } from "@/ui/screen-section";

const whenWording = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function OwnOpenRoleRequest() {
  const open = useMyOpenRoleRequest();
  // Nothing while it loads, so the panel never shows up and then vanishes.
  if (open.isPending || open.data === null) return null;
  return (
    <ScreenSection
      id="own-open-role-request"
      title="Your Role Request"
      beside={
        <Link to="/account" className="text-primary ml-auto text-sm hover:underline">
          See it on your account
        </Link>
      }
    >
      {open.isError ? (
        <ListNotLoaded
          what="Role Requests you raised"
          reason={open.error}
          onRetry={() => void open.refetch()}
        />
      ) : (
        <p className="text-sm">
          You asked for the {roleWording[open.data.role]} role on{" "}
          <time dateTime={open.data.createdAt}>
            {whenWording.format(new Date(open.data.createdAt))}
          </time>
          . No Administrator has decided it yet.
        </p>
      )}
    </ScreenSection>
  );
}
