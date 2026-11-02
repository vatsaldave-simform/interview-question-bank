import type { CategoryName } from "@iqb/shared";
import { ChevronDownIcon } from "lucide-react";
import { useClients } from "@/features/clients/clients.queries";
import { clientsIn, tagsIn, type BrowseSearch } from "@/features/questions/browse.schema";
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

/** Two Tags picked in one Category widen it, as two Clients do, and each Category and the
 * Clients narrow across each other, which is how the API reads the filter (ADR-0025). */
export function BrowseFilters({ search, onSearchChange }: BrowseFiltersProps) {
  const categories = useCategories();
  const clients = useClients();

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

  function setChosen(name: CategoryName | "client", chosen: string[]) {
    // A new filter starts at its first page, since the old page number means nothing now.
    onSearchChange({
      ...search,
      [name]: chosen.length === 0 ? undefined : chosen,
      offset: undefined,
    });
  }

  return (
    <>
      {categories.data.map((category) => (
        <FilterPill
          key={category.name}
          label={category.displayName}
          choices={category.tags.map((tag) => ({ value: tag, name: tag }))}
          chosen={tagsIn(search, category.name)}
          onChange={(tags) => setChosen(category.name, tags)}
        />
      ))}
      {/* Left out until the Clients arrive, so a Client list that fails never blocks browsing
          by Tag. */}
      {clients.isSuccess && clients.data.length > 0 && (
        <FilterPill
          label="Client"
          choices={clients.data.map((client) => ({ value: client.id, name: client.name }))}
          chosen={clientsIn(search)}
          onChange={(ids) => setChosen("client", ids)}
        />
      )}
    </>
  );
}

/** What the address holds, and what the menu shows for it: a Tag is both, a Client is
 * named in the menu but sent by id. */
type Choice = { value: string; name: string };

type FilterPillProps = {
  label: string;
  choices: readonly Choice[];
  chosen: readonly string[];
  onChange: (chosen: string[]) => void;
};

function FilterPill({ label, choices, chosen, onChange }: FilterPillProps) {
  const [only] = chosen;
  const onlyName = choices.find((choice) => choice.value === only)?.name ?? only;
  const summary =
    chosen.length === 0 ? "Any" : chosen.length === 1 ? onlyName : `${chosen.length} chosen`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-(--glass-edge) bg-card focus-visible:ring-ring/50 inline-flex h-10.5 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium shadow-sm outline-none [backdrop-filter:var(--glass-blur-card)] focus-visible:ring-[3px]"
        >
          <span className="text-muted-foreground">{label} ·</span>{" "}
          {/* A fixed width, so that picking a Tag does not move the pills beside this one. */}
          <span className="w-22 truncate text-left">{summary}</span>
          <ChevronDownIcon aria-hidden="true" className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      {/* The bulk bank puts dozens of Tags in one Category, so the menu scrolls. */}
      <DropdownMenuContent align="start" className="max-h-72 min-w-48">
        {choices.map(({ value, name }) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={chosen.includes(value)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...chosen, value] : chosen.filter((one) => one !== value))
            }
            // Stays open, so that several can be picked in one go.
            onSelect={(event) => event.preventDefault()}
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
