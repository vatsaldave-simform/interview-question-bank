import type { CategoryName, CategoryWithTags } from "@iqb/shared";
import { ChevronDownIcon } from "lucide-react";
import { tagsIn, type BrowseSearch } from "@/features/questions/browse.schema";
import { useCategories } from "@/features/questions/questions.queries";
import { Button } from "@/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/shadcn/dropdown-menu";

type BrowseFiltersProps = {
  search: BrowseSearch;
  onSearchChange: (search: BrowseSearch) => void;
};

/** Two Tags picked in one Category widen it, and Tags picked in two Categories narrow
 * across them, which is how the API reads the filter (ADR-0025). */
export function BrowseFilters({ search, onSearchChange }: BrowseFiltersProps) {
  const categories = useCategories();

  if (categories.isPending) {
    return <p className="text-muted-foreground text-sm">Loading the Tags…</p>;
  }
  if (categories.isError) {
    return (
      <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
        The Tags could not be loaded.
        <Button variant="outline" size="sm" onClick={() => void categories.refetch()}>
          Try again
        </Button>
      </p>
    );
  }

  function setTags(name: CategoryName, tags: string[]) {
    // A new filter starts at its first page, since the old page number means nothing now.
    onSearchChange({ ...search, [name]: tags.length === 0 ? undefined : tags, offset: undefined });
  }

  return categories.data.map((category) => (
    <CategoryFilter
      key={category.name}
      category={category}
      chosen={tagsIn(search, category.name)}
      onChange={(tags) => setTags(category.name, tags)}
    />
  ));
}

type CategoryFilterProps = {
  category: CategoryWithTags;
  chosen: readonly string[];
  onChange: (tags: string[]) => void;
};

function CategoryFilter({ category, chosen, onChange }: CategoryFilterProps) {
  const [only] = chosen;
  const summary = chosen.length === 0 ? "Any" : chosen.length === 1 ? only : `${chosen.length} chosen`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-(--glass-edge) bg-card focus-visible:ring-ring/50 inline-flex h-10.5 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium shadow-sm outline-none [backdrop-filter:var(--glass-blur-card)] focus-visible:ring-[3px]"
        >
          <span className="text-muted-foreground">{category.displayName} ·</span>{" "}
          {/* A fixed width, so that picking a Tag does not move the pills beside this one. */}
          <span className="w-22 truncate text-left">{summary}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      {/* The bulk bank puts dozens of Tags in one Category, so the menu scrolls. */}
      <DropdownMenuContent align="start" className="max-h-72 min-w-48">
        {category.tags.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={chosen.includes(tag)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...chosen, tag] : chosen.filter((one) => one !== tag))
            }
            // Stays open, so that several Tags can be picked in one go.
            onSelect={(event) => event.preventDefault()}
          >
            {tag}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
