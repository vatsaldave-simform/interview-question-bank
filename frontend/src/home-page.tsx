import { BrowseSearchBox } from "@/features/questions/browse-search-box";
import { RecentlyAddedQuestions } from "@/features/questions/recently-added-questions";
import { useSession } from "@/platform/session";
import { PageHeader } from "@/ui/page-header";

type HomePageProps = {
  onSearch: (keywords: string | undefined) => void;
};

/** Beside the route assembly and not in a feature, because like it, Home is put together
 * from the panels of several features (ADR-0047). */
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
      <RecentlyAddedQuestions />
    </div>
  );
}
