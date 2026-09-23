import type { QuestionListResponse } from "@iqb/shared";
import { listRequestFor, type BrowseSearch } from "@/features/questions/browse.schema";
import { BrowseFilters } from "@/features/questions/browse-filters";
import { BrowsePages } from "@/features/questions/browse-pages";
import { BrowseSearchBox } from "@/features/questions/browse-search-box";
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
  const asked = listRequestFor(search);
  const request = "request" in asked ? asked.request : null;
  const list = useQuestionList(request);

  const namesAFilter = Object.entries(search).some(
    ([name, value]) => name !== "offset" && value !== undefined,
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[14rem_1fr]">
      <aside className="flex flex-col gap-6" aria-label="Filters">
        <BrowseFilters search={search} onSearchChange={onSearchChange} />
        {(namesAFilter || request === null) && (
          <Button variant="outline" size="sm" onClick={() => onSearchChange({})}>
            Clear filters
          </Button>
        )}
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <h1 className="text-2xl font-semibold">Questions</h1>
        <BrowseSearchBox
          // A new key resets the box to the address, after Back or Clear filters.
          key={String(search.keywords ?? "")}
          keywords={typeof search.keywords === "string" ? search.keywords : undefined}
          onSearch={(keywords) => onSearchChange({ ...search, keywords, offset: undefined })}
        />
        {"problem" in asked ? (
          <Alert variant="destructive">
            <AlertTitle>This address cannot be shown</AlertTitle>
            <AlertDescription>
              <p>{asked.problem} Clear the filters to start again.</p>
            </AlertDescription>
          </Alert>
        ) : list.isPending ? (
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
        {request !== null && (
          <BrowsePages
            offset={request.offset}
            shown={list.data?.questions.length ?? null}
            onMove={(next) =>
              onSearchChange({ ...search, offset: next === 0 ? undefined : next })
            }
          />
        )}
      </div>
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

/** Anything but an API refusal is an answer the shared schema refused, and the parser's
 * complaint about it means nothing to a Viewer. */
function whatWentWrong(reason: Error): string {
  return reason instanceof ApiFailure
    ? reason.message
    : "The bank answered, but not in a way this client understands.";
}
