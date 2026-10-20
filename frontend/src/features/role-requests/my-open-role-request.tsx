import { useMyOpenRoleRequest } from "@/features/role-requests/role-requests.queries";
import { roleWording } from "@/features/viewers/role-wording";
import { dateWording } from "@/platform/when-wording";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { ScreenSection } from "@/ui/screen-section";
import { SectionLink } from "@/ui/section-link";

export function MyOpenRoleRequest() {
  const open = useMyOpenRoleRequest();
  // Nothing while it loads, so the panel never shows up and then vanishes.
  if (open.isPending || open.data === null) return null;
  return (
    <ScreenSection
      id="my-open-role-request"
      title="Your Role Request"
      beside={<SectionLink to="/account">See it on your account</SectionLink>}
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
            {dateWording(open.data.createdAt)}
          </time>
          . No Administrator has decided it yet.
        </p>
      )}
    </ScreenSection>
  );
}
