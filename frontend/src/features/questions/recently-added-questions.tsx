import type { ListQuestionsRequest } from "@iqb/shared";
import { Link } from "@tanstack/react-router";
import { AverageRating, ratingIsShown } from "@/features/questions/average-rating";
import { QuestionClients } from "@/features/questions/question-clients";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { QuestionTags } from "@/features/questions/question-tags";
import { useQuestionList } from "@/features/questions/questions.queries";
import { WhenAdded } from "@/features/questions/when-added";
import { cardRow, cardRowLink, cardRows } from "@/ui/card-rows";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowDetails } from "@/ui/row-details";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";
import { SectionLink } from "@/ui/section-link";

/** Browse's own first page, cut to five, so only Questions Visible to the Viewer appear. */
const newestFive: ListQuestionsRequest = { keywords: undefined, limit: 5, offset: 0 };

const tagsShown = 2;

export function RecentlyAddedQuestions() {
  const list = useQuestionList(newestFive);
  return (
    <ScreenSection
      id="recently-added"
      title="Recently added"
      beside={<SectionLink to="/questions">See them all in Browse</SectionLink>}
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
        <ul className={cardRows}>
          {list.data.questions.map((question) => (
            <li key={question.id} className={cardRow}>
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className={cardRowLink}
              >
                {question.text}
              </Link>
              <RowDetails>
                {question.publicationState !== "published" && (
                  <PublicationStateBadge state={question.publicationState} />
                )}
                <QuestionTags tags={question.tags.slice(0, tagsShown)} />
                <QuestionClients clients={question.clients} />
                {ratingIsShown(question) && <AverageRating rating={question.rating} />}
                <WhenAdded createdAt={question.createdAt} />
              </RowDetails>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
