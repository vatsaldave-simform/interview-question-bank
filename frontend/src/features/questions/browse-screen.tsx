import type { QuestionListResponse } from "@iqb/shared";
import type { BrowseSearch } from "@/features/questions/browse.schema";
import { BrowsePages } from "@/features/questions/browse-pages";
import { QuestionCard } from "@/features/questions/question-card";
import { useQuestionList } from "@/features/questions/questions.queries";
import { ApiFailure } from "@/platform/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";

type BrowseScreenProps = {
  search: BrowseSearch;
  onSearchChange: (search: BrowseSearch) => void;
};

/** Knows nothing about the router: it is handed the filter and told how to change it. */
export function BrowseScreen({ search, onSearchChange }: BrowseScreenProps) {
  const list = useQuestionList(search);
  const offset = search.offset ?? 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Questions</h1>
      {list.isPending ? (
        <p role="status" className="text-muted-foreground">
          Loading Questions…
        </p>
      ) : list.isError ? (
        <Alert variant="destructive">
          <AlertTitle>The Questions could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{whatWentWrong(list.error)}</p>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <QuestionList page={list.data} />
      )}
      <BrowsePages
        offset={offset}
        shown={list.data?.questions.length ?? null}
        onMove={(next) => onSearchChange({ ...search, offset: next === 0 ? undefined : next })}
      />
    </div>
  );
}

function QuestionList({ page }: { page: QuestionListResponse }) {
  if (page.questions.length === 0) {
    return (
      <p className="text-muted-foreground">
        {page.offset === 0 ? "No Questions match." : "There are no more Questions."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {page.questions.map((question) => (
        <li key={question.id}>
          <QuestionCard question={question} />
        </li>
      ))}
    </ul>
  );
}

/** The API's own words when it sent them. Anything else is an answer the shared schema
 * refused, and the parser's complaint means nothing to a Viewer. */
function whatWentWrong(reason: Error): string {
  return reason instanceof ApiFailure
    ? reason.message
    : "The bank answered, but not in a way this client understands.";
}
