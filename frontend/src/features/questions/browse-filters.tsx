import type { CategoryName } from "@iqb/shared";
import { tagsIn, type BrowseSearch } from "@/features/questions/browse.schema";
import { CategoryTags } from "@/features/questions/category-tags";
import { useCategories } from "@/features/questions/questions.queries";
import { Alert, AlertDescription } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { FieldGroup } from "@/ui/shadcn/field";

type BrowseFiltersProps = {
  search: BrowseSearch;
  onSearchChange: (search: BrowseSearch) => void;
};

/** Two Tags ticked in one Category widen it, and Tags ticked in two Categories narrow
 * across them, which is how the API reads the filter (ADR-0025). */
export function BrowseFilters({ search, onSearchChange }: BrowseFiltersProps) {
  const categories = useCategories();

  if (categories.isPending) {
    return <p className="text-muted-foreground text-sm">Loading the Tags…</p>;
  }
  if (categories.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>The Tags could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => void categories.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  function setTags(name: CategoryName, tags: string[]) {
    // A new filter starts at its first page, since the old page number means nothing now.
    onSearchChange({ ...search, [name]: tags.length === 0 ? undefined : tags, offset: undefined });
  }

  return (
    <FieldGroup className="gap-6">
      {categories.data.map((category) => (
        <CategoryTags
          key={category.name}
          idPrefix="filter"
          category={category}
          chosen={tagsIn(search, category.name)}
          onChange={(tags) => setTags(category.name, tags)}
        />
      ))}
    </FieldGroup>
  );
}
