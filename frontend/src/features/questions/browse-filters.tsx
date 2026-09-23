import type { CategoryName, CategoryWithTags } from "@iqb/shared";
import { tagsIn, type BrowseSearch } from "@/features/questions/browse.schema";
import { useCategories } from "@/features/questions/questions.queries";
import { Alert, AlertDescription } from "@/ui/shadcn/alert";
import { Button } from "@/ui/shadcn/button";
import { Checkbox } from "@/ui/shadcn/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/ui/shadcn/field";

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
          category={category}
          chosen={tagsIn(search, category.name)}
          onChange={(tags) => setTags(category.name, tags)}
        />
      ))}
    </FieldGroup>
  );
}

type CategoryTagsProps = {
  category: CategoryWithTags;
  chosen: readonly string[];
  onChange: (tags: string[]) => void;
};

function CategoryTags({ category, chosen, onChange }: CategoryTagsProps) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{category.displayName}</FieldLegend>
      {/* The bulk bank puts dozens of Tags in one Category, and an unbounded list would push
          the Questions off the screen. */}
      <FieldGroup data-slot="checkbox-group" className="max-h-60 overflow-y-auto">
        {category.tags.map((tag) => {
          const id = `filter-${category.name}-${tag}`;
          return (
            <Field key={tag} orientation="horizontal">
              <Checkbox
                id={id}
                checked={chosen.includes(tag)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true ? [...chosen, tag] : chosen.filter((one) => one !== tag),
                  )
                }
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {tag}
              </FieldLabel>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}
