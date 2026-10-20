import { Link } from "@tanstack/react-router";
import { useFirstPendingQuestions } from "@/features/questions/questions.queries";
import { waitedWording } from "@/platform/when-wording";
import { ListNotLoaded } from "@/ui/list-not-loaded";
import { RowDetails } from "@/ui/row-details";
import { RowsLoading } from "@/ui/rows-loading";
import { ScreenSection } from "@/ui/screen-section";
import { SectionLink } from "@/ui/section-link";

const shownOnHome = 5;

export function PendingQuestionsWaiting() {
  const pending = useFirstPendingQuestions(shownOnHome);
  return (
    <ScreenSection
      id="pending-questions-waiting"
      title="Waiting for your review"
      beside={<SectionLink to="/review">Open the Review queue</SectionLink>}
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
        <p className="text-muted-foreground text-sm">
          Nothing is waiting for review. New Questions appear here when an Author sends them.
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {pending.data.map((question) => (
            <li key={question.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className="hover:text-primary line-clamp-2 font-medium hover:underline"
              >
                {question.text}
              </Link>
              <RowDetails>
                <p>From {question.author.email}</p>
                {/* From when it was added, because the API does not say when it was sent for
                    review, so a Question sent back and sent again counts from the start. */}
                <p>Waiting {waitedWording(question.createdAt)}</p>
              </RowDetails>
            </li>
          ))}
        </ul>
      )}
    </ScreenSection>
  );
}
