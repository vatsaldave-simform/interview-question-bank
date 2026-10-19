import { Link } from "@tanstack/react-router";
import { useReviewQueueStart } from "@/features/questions/questions.queries";
import { ScreenSection } from "@/features/questions/screen-section";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowsLoading } from "@/ui/rows-loading";

const shownOnHome = 5;

export function PendingQuestionsWaiting() {
  const pending = useReviewQueueStart(shownOnHome);
  return (
    <ScreenSection
      id="pending-questions-waiting"
      title="Waiting for your review"
      beside={
        <Link to="/review" className="text-primary ml-auto text-sm hover:underline">
          Open the Review queue
        </Link>
      }
    >
      {pending.isPending ? (
        <RowsLoading label="Loading the Pending Questions…" rows={shownOnHome} onCard />
      ) : pending.isError ? (
        <ListNotLoaded
          what="Pending Questions"
          reason={pending.error}
          onRetry={() => void pending.refetch()}
        />
      ) : pending.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Question is waiting for review.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {pending.data.map((question) => (
            <li key={question.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className="hover:text-primary line-clamp-2 font-medium hover:underline"
              >
                {question.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
