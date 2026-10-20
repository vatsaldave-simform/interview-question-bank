import type { CategoryName, CategoryWithTags, QuestionTag } from "@iqb/shared";
import { CheckIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useCategories } from "@/features/questions/questions.queries";
import { Button } from "@/ui/shadcn/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/ui/shadcn/field";
import { Skeleton } from "@/ui/shadcn/skeleton";

type TagsFieldProps = {
  chosen: readonly QuestionTag[];
  problem: string | undefined;
  onChange: (tags: QuestionTag[]) => void;
};

export function TagsField({ chosen, problem, onChange }: TagsFieldProps) {
  const categories = useCategories();

  if (categories.isPending) {
    return (
      <div role="status">
        <span className="sr-only">Loading the Tags…</span>
        <TagChipShapes />
      </div>
    );
  }
  if (categories.isError) {
    return (
      <p role="alert" className="text-destructive flex flex-wrap items-center gap-2 text-sm">
        The Tags could not be loaded.
        <Button type="button" variant="outline" size="sm" onClick={() => void categories.refetch()}>
          Try again
        </Button>
      </p>
    );
  }
  return (
    <KnownTagsField
      categories={categories.data}
      chosen={chosen}
      problem={problem}
      onChange={onChange}
    />
  );
}

const quickAddShown = 6;

type KnownTagsFieldProps = TagsFieldProps & { categories: readonly CategoryWithTags[] };

type OptionGroup = { label: string; options: QuestionTag[] };

const sameTag = (one: QuestionTag, other: QuestionTag) =>
  one.category === other.category && one.tag === other.tag;

/** Offers only the Tags the API listed, because a Tag it does not know is refused. */
function KnownTagsField({ categories, chosen, problem, onChange }: KnownTagsFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [allShown, setAllShown] = useState<ReadonlySet<CategoryName>>(new Set());

  const isChosen = (tag: QuestionTag) => chosen.some((one) => sameTag(one, tag));
  const categoryNamed = (name: string) =>
    categories.find((category) => category.name === name)?.displayName ?? name;
  const notChosenIn = (category: CategoryWithTags) =>
    category.tags
      .map((tag) => ({ category: category.name, tag }))
      .filter((tag) => !isChosen(tag));

  const query = typed.trim().toLowerCase();
  const offered: OptionGroup[] = categories
    .map((category) => ({
      label: category.displayName,
      options: notChosenIn(category).filter(({ tag }) => tag.toLowerCase().includes(query)),
    }))
    .filter((group) => group.options.length > 0);
  const options = offered.flatMap((group) => group.options);
  const listShown = open && (options.length > 0 || query !== "");
  const activeOption = options[Math.min(active, options.length - 1)];

  // Shown in the Categories' order, whatever order they were added in.
  const inOrder = categories.flatMap((category) =>
    chosen.filter((one) => one.category === category.name),
  );

  function add(tags: QuestionTag[]) {
    const fresh = tags.filter((tag) => !isChosen(tag));
    if (fresh.length === 0) return;
    onChange([...chosen, ...fresh]);
    setAnnouncement(
      fresh.map(({ category, tag }) => `Added ${tag}, a ${categoryNamed(category)} Tag.`).join(" "),
    );
  }

  function remove(gone: QuestionTag) {
    onChange(chosen.filter((one) => !sameTag(one, gone)));
    setAnnouncement(`Removed ${gone.tag}.`);
  }

  function addOption(option: QuestionTag) {
    add([option]);
    setTyped("");
    setActive(0);
  }

  /** Puts the active option on the Tag typed exactly, when there is one. */
  function showMatchesFor(text: string) {
    const exact = text.trim().toLowerCase();
    const matches = categories.flatMap((category) =>
      notChosenIn(category).filter(({ tag }) => tag.toLowerCase().includes(exact)),
    );
    const hit = matches.findIndex(({ tag }) => tag.toLowerCase() === exact);
    if (exact !== "" && matches.length === 0) setAnnouncement("No Tag matches.");
    setTyped(text);
    setActive(Math.max(hit, 0));
    setOpen(true);
  }

  /** Text pasted with commas adds every Tag it names exactly, and keeps what follows the last. */
  function typeOrPaste(text: string) {
    if (!text.includes(",")) return showMatchesFor(text);
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    const named = parts.map((part) => part.trim().toLowerCase()).filter((part) => part !== "");
    add(
      categories.flatMap((category) =>
        notChosenIn(category).filter(({ tag }) => named.includes(tag.toLowerCase())),
      ),
    );
    showMatchesFor(rest);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else if (options.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((Math.min(active, options.length - 1) + step + options.length) % options.length);
      }
    } else if (event.key === "Enter" || event.key === ",") {
      // Enter in this box adds a Tag; it never sends the form.
      event.preventDefault();
      if (listShown && activeOption !== undefined) addOption(activeOption);
    } else if (event.key === "Backspace" && typed === "" && inOrder.length > 0) {
      remove(inOrder[inOrder.length - 1]!);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const activeIndex = activeOption === undefined ? -1 : options.indexOf(activeOption);

  return (
    <Field data-invalid={problem !== undefined}>
      <FieldLabel htmlFor={`${id}-input`}>Tags</FieldLabel>
      <div
        className="border-(--field-line) bg-(--field) has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 relative flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 has-[input:focus-visible]:ring-[3px]"
        onClick={() => input.current?.focus()}
      >
        {inOrder.length > 0 && (
          <ul className="contents" aria-label="Chosen Tags">
            {inOrder.map((tag) => (
              <li
                key={`${tag.category}/${tag.tag}`}
                title={categoryNamed(tag.category)}
                className="bg-secondary text-secondary-foreground inline-flex h-6.5 items-center gap-0.5 rounded-full pr-0.5 pl-2.5 text-xs font-medium"
              >
                {tag.tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag.tag}`}
                  className="hover:bg-foreground/10 focus-visible:ring-ring/50 inline-grid size-5 place-items-center rounded-full outline-none focus-visible:ring-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(tag);
                    input.current?.focus();
                  }}
                >
                  <XIcon aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listShown}
          aria-controls={listId}
          aria-activedescendant={listShown && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={`${id}-status ${id}-help`}
          aria-invalid={problem !== undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={chosen.length > 0 ? "Add another Tag" : "Type a Tag, for example react"}
          value={typed}
          onChange={(event) => typeOrPaste(event.target.value)}
          onKeyDown={onKeyDown}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="placeholder:text-muted-foreground min-w-30 flex-[1_1_8.75rem] bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        <div
          id={listId}
          role="listbox"
          aria-label="Known Tags"
          hidden={!listShown}
          className="bg-popover text-popover-foreground border-(--glass-edge) absolute inset-x-[-1px] top-[calc(100%+0.375rem)] z-20 max-h-68 cursor-default overflow-y-auto rounded-xl border p-1.5 shadow-md [backdrop-filter:var(--glass-blur-popover)]"
        >
          {options.length === 0 && <p className="text-muted-foreground px-2.5 py-2 text-sm">No Tag matches</p>}
          {offered.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div
                aria-hidden="true"
                className="text-muted-foreground px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase"
              >
                {group.label}
              </div>
              {group.options.map((option) => {
                const optionIndex = options.indexOf(option);
                return (
                  <div
                    key={option.tag}
                    id={optionId(optionIndex)}
                    role="option"
                    aria-selected={optionIndex === activeIndex}
                    className="hover:bg-accent aria-selected:bg-secondary aria-selected:text-secondary-foreground cursor-pointer rounded-md px-2.5 py-1.5 text-sm"
                    // Keeps the focus in the box, so the list stays open for the next Tag.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addOption(option)}
                  >
                    {option.tag}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        id={`${id}-status`}
        className="text-muted-foreground flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs"
      >
        {categories.map((category) => {
          const count = chosen.filter((one) => one.category === category.name).length;
          return (
            <span
              key={category.name}
              className={count > 0 ? "text-foreground inline-flex items-center gap-1" : "inline-flex items-center gap-1"}
            >
              {count > 0 ? (
                <CheckIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <span aria-hidden="true" className="size-3 rounded-full border-[1.5px] border-current opacity-60" />
              )}
              {count > 0 ? `${category.displayName}: ${count}` : `${category.displayName}: none`}
            </span>
          );
        })}
        <span className="ml-auto tabular-nums">
          {chosen.length === 1 ? "1 Tag" : `${chosen.length} Tags`}
        </span>
      </div>
      <QuickAdd
        categories={categories}
        notChosenIn={notChosenIn}
        allShown={allShown}
        onShowAll={(name, all) => {
          const next = new Set(allShown);
          if (all) next.add(name);
          else next.delete(name);
          setAllShown(next);
        }}
        onAdd={(tag) => {
          add([tag]);
          input.current?.focus();
        }}
      />
      <FieldDescription id={`${id}-help`}>
        Pick from the known Tags. Viewers find Questions in Browse by these. Press Enter or a comma
        to add the Tag picked in the list.
      </FieldDescription>
      <FieldError>{problem}</FieldError>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Field>
  );
}

type QuickAddProps = {
  categories: readonly CategoryWithTags[];
  notChosenIn: (category: CategoryWithTags) => QuestionTag[];
  allShown: ReadonlySet<CategoryName>;
  onShowAll: (category: CategoryName, all: boolean) => void;
  onAdd: (tag: QuestionTag) => void;
};

/** One row per Category, so Tags from several Categories are a click each. */
function QuickAdd({ categories, notChosenIn, allShown, onShowAll, onAdd }: QuickAddProps) {
  const rows = categories
    .map((category) => ({ category, left: notChosenIn(category) }))
    .filter(({ left }) => left.length > 0);
  if (rows.length === 0) return null;
  return (
    <div className="border-border flex flex-col gap-2 rounded-xl border px-3 py-2.5">
      {rows.map(({ category, left }) => {
        const showsAll = allShown.has(category.name);
        const shown = showsAll ? left : left.slice(0, quickAddShown);
        const more = left.length - shown.length;
        return (
          <div
            key={category.name}
            role="group"
            aria-label={`Quick add ${category.displayName} Tags`}
            className="flex flex-wrap items-start gap-1.5 sm:flex-nowrap"
          >
            <span
              aria-hidden="true"
              className="text-muted-foreground basis-full pt-1.5 text-xs font-semibold tracking-wide uppercase sm:basis-24 sm:shrink-0"
            >
              {category.displayName}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {shown.map((tag) => (
                <button
                  key={tag.tag}
                  type="button"
                  className="border-(--field-line) hover:bg-accent focus-visible:ring-ring/50 inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-[3px]"
                  aria-label={`Add ${tag.tag}`}
                  onClick={() => onAdd(tag)}
                >
                  <PlusIcon aria-hidden="true" className="size-3.5" />
                  {tag.tag}
                </button>
              ))}
              {more > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground h-7 px-1.5 text-xs underline"
                  aria-label={`Show ${more} more ${category.displayName} Tags`}
                  onClick={() => onShowAll(category.name, true)}
                >
                  {more} more
                </button>
              ) : (
                showsAll &&
                left.length > quickAddShown && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground h-7 px-1.5 text-xs underline"
                    onClick={() => onShowAll(category.name, false)}
                  >
                    Fewer
                  </button>
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const chipWidths = ["w-24", "w-16", "w-28", "w-20", "w-24", "w-14", "w-20"];

/** Shaped like the chips, so the card does not jump when the Tags arrive. */
export function TagChipShapes() {
  return (
    <div className="flex flex-wrap gap-2">
      {chipWidths.map((width, chip) => (
        <Skeleton key={chip} className={`bg-muted h-7 rounded-full ${width}`} />
      ))}
    </div>
  );
}
