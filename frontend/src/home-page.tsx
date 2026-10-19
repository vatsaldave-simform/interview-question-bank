import { BrowseSearchBox } from "@/features/questions/browse-search-box";
import { OwnQuestionsWaiting } from "@/features/questions/own-questions-waiting";
import { PendingQuestionsWaiting } from "@/features/questions/pending-questions-waiting";
import { RecentlyAddedQuestions } from "@/features/questions/recently-added-questions";
import { isPageShownTo } from "@/platform/app-pages";
import { HomeShortcuts } from "@/platform/home-shortcuts";
import { useSession } from "@/platform/session";
import { PageHeader } from "@/ui/page-header";

type HomePageProps = {
  onSearch: (keywords: string | undefined) => void;
};

/** Not in a feature, because its panels come from several features (ADR-0047). */
export function HomePage({ onSearch }: HomePageProps) {
  const session = useSession();
  // The shell renders nothing until there is a signed-in Viewer, so this is never shown.
  if (session.status !== "signed-in") return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Welcome back"
        description={
          `Signed in as ${session.viewer.email}. Search the bank, or start from what is new.`
        }
      />
      <section aria-label="Search the bank">
        <BrowseSearchBox keywords={undefined} onSearch={onSearch} large />
      </section>
      {isPageShownTo(session.viewer, "your-questions") && <OwnQuestionsWaiting />}
      {isPageShownTo(session.viewer, "review-queue") && <PendingQuestionsWaiting />}
      <RecentlyAddedQuestions />
      <HomeShortcuts viewer={session.viewer} />
    </div>
  );
}
