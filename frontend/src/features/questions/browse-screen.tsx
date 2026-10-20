import type { QuestionListResponse } from "@iqb/shared";
import { LibraryIcon, SearchXIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AddAQuestionButton } from "@/features/questions/add-a-question-button";
import { listRequestFor, type BrowseSearch } from "@/features/questions/browse.schema";
import { BrowseFilters } from "@/features/questions/browse-filters";
import { BrowseSearchBox } from "@/features/questions/browse-search-box";
import { QuestionCard } from "@/features/questions/question-card";
import { QuestionCardsLoading } from "@/features/questions/question-cards-loading";
import { QuestionPages } from "@/features/questions/question-pages";
import { useQuestionList } from "@/features/questions/questions.queries";
import { useMayAddAQuestion } from "@/features/questions/use-may-add-a-question";
import { whatWentWrong } from "@/platform/api-client";
import { EmptyList } from "@/ui/empty-list";
import { PageHeader } from "@/ui/page-header";
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
  const mayAddAQuestion = useMayAddAQuestion();

  const namesAFilter = Object.entries(search).some(
    ([name, value]) => name !== "offset" && value !== undefined,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-section">
      <PageHeader
        title="Questions"
        description="Every Published Question you can see, to search or narrow by Category."
        action={mayAddAQuestion && <AddAQuestionButton />}
      />
      <div className="grid gap-section md:grid-cols-[14rem_1fr]">
        <aside className="flex flex-col gap-6" aria-label="Filters">
          <BrowseFilters search={search} onSearchChange={onSearchChange} />
          {(namesAFilter || request === null) && (
            <Button variant="outline" size="sm" onClick={() => onSearchChange({})}>
              Clear filters
            </Button>
          )}
        </aside>
        <div className="flex min-w-0 flex-col gap-section">
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
            <QuestionCardsLoading label="Loading Questions…" />
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
            <QuestionList
              page={list.data}
              whenEmpty={
                <NothingToShow
                  namesAFilter={namesAFilter}
                  onClearFilter={() => onSearchChange({})}
                />
              }
            />
          )}
          {request !== null && (
            <QuestionPages
              offset={request.offset}
              shown={list.data?.questions.length ?? null}
              onMove={(next) =>
                onSearchChange({ ...search, offset: next === 0 ? undefined : next })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

type QuestionListProps = {
  page: QuestionListResponse;
  /** Shown in place of a first page with nothing on it. */
  whenEmpty: ReactNode;
};

function QuestionList({ page, whenEmpty }: QuestionListProps) {
  if (page.questions.length === 0 && page.offset > 0) {
    return <p className="text-muted-foreground">There are no more Questions.</p>;
  }
  if (page.questions.length === 0) return whenEmpty;
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

type NothingToShowProps = { namesAFilter: boolean; onClearFilter: () => void };

function NothingToShow({ namesAFilter, onClearFilter }: NothingToShowProps) {
  const mayAddAQuestion = useMayAddAQuestion();
  if (namesAFilter) {
    return (
      <EmptyList
        icon={SearchXIcon}
        title="No Question matches this filter"
        action={
          <Button variant="outline" onClick={onClearFilter}>
            Clear the filter
          </Button>
        }
      >
        Try fewer Tags or words, or clear the filter to see every Question you can see.
      </EmptyList>
    );
  }
  return (
    // Not "the bank is empty": it may hold Questions restricted to a Client this Viewer
    // holds no Permission Grant for.
    <EmptyList
      icon={LibraryIcon}
      title="No Question you can see yet"
      action={mayAddAQuestion ? <AddAQuestionButton /> : undefined}
    >
      {mayAddAQuestion
        ? "Add the first one. A Reviewer reads it before it is in the bank."
        : "Questions appear here once a Reviewer Publishes them."}
    </EmptyList>
  );
}
