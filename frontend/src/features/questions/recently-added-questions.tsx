import type { ListQuestionsRequest } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { QuestionTags } from "@/features/questions/question-tags";
import { useQuestionList } from "@/features/questions/questions.queries";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";

/** Browse's own first page, cut to five, so only Questions Visible to the Viewer appear. */
const newestFive: ListQuestionsRequest = { keywords: undefined, limit: 5, offset: 0 };

export function RecentlyAddedQuestions() {
  const list = useQuestionList(newestFive);
  return (
    <ScreenSection
      id="recently-added"
      title="Recently added"
      beside={
        <Link to="/questions" className="text-primary ml-auto text-sm hover:underline">
          See them all in Browse
        </Link>
      }
    >
      {list.isPending ? (
        <RowsLoading label="Loading the newest Questions…" rows={newestFive.limit} onCard />
      ) : list.isError ? (
        <ListNotLoaded
          what="newest Questions"
          reason={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : list.data.questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing has been added to the bank yet.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {list.data.questions.map((question) => (
            <li key={question.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className="hover:text-primary line-clamp-2 font-medium hover:underline"
              >
                {question.text}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {question.publicationState !== "published" && (
                  <PublicationStateBadge state={question.publicationState} />
                )}
                <QuestionTags tags={question.tags} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
