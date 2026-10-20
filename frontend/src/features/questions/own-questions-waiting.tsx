import { Link } from "@tanstack/react-router";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { useFirstOwnQuestions } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { WhenAdded } from "@/features/questions/when-added";
import { cardRow, cardRowLink, cardRows } from "@/ui/card-rows";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowDetails } from "@/ui/row-details";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";
import { SectionLink } from "@/ui/section-link";

const shownOnHome = 5;

export function OwnQuestionsWaiting() {
  const own = useFirstOwnQuestions(shownOnHome);
  return (
    <ScreenSection
      id="own-questions-waiting"
      title="Your Pending and Rejected Questions"
      beside={<SectionLink to="/questions/own">See them all</SectionLink>}
    >
      {own.isPending ? (
        <RowsLoading label="Loading your Questions…" rows={shownOnHome} onCard />
      ) : own.isError ? (
        <ListNotLoaded
          what="Questions you added"
          reason={own.error}
          onRetry={() => void own.refetch()}
        />
      ) : own.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing of yours is Pending or Rejected. When you add a Question, you can follow it here.
        </p>
      ) : (
        <ul className={cardRows}>
          {own.data.map((question) => (
            <li key={question.id} className={cardRow}>
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className={cardRowLink}
              >
                {question.text}
              </Link>
              <RowDetails>
                <PublicationStateBadge state={question.publicationState} />
                <WhenAdded createdAt={question.createdAt} />
              </RowDetails>
              {question.reason !== null && <RejectionReason reason={question.reason} />}
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
