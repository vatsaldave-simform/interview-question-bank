import type { ViewerRole } from "@iqb/shared";
import { BrowseSearchBox } from "@/features/questions/browse-search-box";
import { OwnQuestionsWaiting } from "@/features/questions/own-questions-waiting";
import { PendingQuestionsWaiting } from "@/features/questions/pending-questions-waiting";
import { RecentlyAddedQuestions } from "@/features/questions/recently-added-questions";
import { MyOpenRoleRequest } from "@/features/role-requests/my-open-role-request";
import { OpenRoleRequestsWaiting } from "@/features/role-requests/open-role-requests-waiting";
import { isPageShownTo } from "@/platform/app-pages";
import { HomeShortcuts } from "@/platform/home-shortcuts";
import { useSession } from "@/platform/session";
import { dayWording } from "@/platform/when-wording";

type HomePageProps = {
  onSearch: (keywords: string | undefined) => void;
};

const roleWithItsArticle: Record<ViewerRole, string> = {
  reader: "a Reader",
  author: "an Author",
  reviewer: "a Reviewer",
};

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Not in a feature, because its panels come from several features (ADR-0047). */
export function HomePage({ onSearch }: HomePageProps) {
  const session = useSession();
  // The shell renders nothing until there is a signed-in Viewer, so this is never shown.
  if (session.status !== "signed-in") return null;
  const { viewer } = session;
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-section">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {dayWording(now)}
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {greetingFor(now.getHours())}
        </h1>
        <p className="text-muted-foreground">
          Signed in as {viewer.email}, {roleWithItsArticle[viewer.role]}
          {viewer.isAdministrator && " and an Administrator"}.
        </p>
      </div>
      <section aria-label="Search the bank">
        <BrowseSearchBox keywords={undefined} onSearch={onSearch} large />
      </section>
      <HomeShortcuts viewer={viewer} />
      <div className="flex flex-col items-start gap-section min-[900px]:flex-row">
        <div className="w-full min-w-0 flex-[1.55_1_0%]">
          <RecentlyAddedQuestions />
        </div>
        {/* Hidden by CSS when empty, because whether Your Role Request shows depends on data
            this page does not hold (ADR-0047). */}
        <div className="flex w-full min-w-0 flex-1 flex-col gap-section empty:hidden">
          {isPageShownTo(viewer, "review-queue") && <PendingQuestionsWaiting />}
          {isPageShownTo(viewer, "role-requests") && <OpenRoleRequestsWaiting />}
          {isPageShownTo(viewer, "your-questions") && <OwnQuestionsWaiting />}
          <MyOpenRoleRequest />
        </div>
      </div>
    </div>
  );
}
