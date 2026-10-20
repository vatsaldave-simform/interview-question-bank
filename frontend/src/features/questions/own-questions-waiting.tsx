import { Link } from "@tanstack/react-router";
import { PublicationStateBadge } from "@/features/questions/publication-state-badge";
import { useFirstOwnQuestions } from "@/features/questions/questions.queries";
import { RejectionReason } from "@/features/questions/rejection-reason";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";

const shownOnHome = 5;

export function OwnQuestionsWaiting() {
  const own = useFirstOwnQuestions(shownOnHome);
  return (
    <ScreenSection
      id="own-questions-waiting"
      title="Your Pending and Rejected Questions"
      beside={
        <Link to="/questions/own" className="text-primary ml-auto text-sm hover:underline">
          See them all
        </Link>
      }
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
          Nothing of yours is waiting or refused. When you add a Question, you can follow it here.
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {own.data.map((question) => (
            <li key={question.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className="hover:text-primary line-clamp-2 font-medium hover:underline"
              >
                {question.text}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <PublicationStateBadge state={question.publicationState} />
              </div>
              {question.reason !== null && <RejectionReason reason={question.reason} />}
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
