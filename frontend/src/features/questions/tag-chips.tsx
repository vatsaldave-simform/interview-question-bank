import type { CategoryWithTags } from "@iqb/shared";
import { CheckIcon } from "lucide-react";
import { Checkbox } from "@/ui/shadcn/checkbox";
import { FieldLegend, FieldSet } from "@/ui/shadcn/field";
import { Skeleton } from "@/ui/shadcn/skeleton";

type TagChipsProps = {
  category: CategoryWithTags;
  chosen: readonly string[];
  onChange: (tags: string[]) => void;
};

/** The form's Tags, which wrap instead of scrolling so that every choice is in view. */
export function TagChips({ category, chosen, onChange }: TagChipsProps) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{category.displayName}</FieldLegend>
      <div className="flex flex-wrap gap-2">
        {category.tags.map((tag) => {
          const id = `question-${category.name}-${tag}`;
          const checked = chosen.includes(tag);
          return (
            <label
              key={tag}
              htmlFor={id}
              className="border-input hover:bg-accent has-focus-visible:border-ring has-focus-visible:ring-ring/50 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary has-data-[state=checked]:text-primary-foreground has-data-[state=checked]:hover:bg-primary/90 relative flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors has-focus-visible:ring-[3px]"
            >
              {/* See-through and over the whole chip, so every click lands on a real checkbox. */}
              <Checkbox
                id={id}
                className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
                checked={checked}
                onCheckedChange={(state) =>
                  onChange(state === true ? [...chosen, tag] : chosen.filter((one) => one !== tag))
                }
              />
              {/* The colour alone would not tell everyone which Tags are chosen. */}
              {checked && <CheckIcon aria-hidden="true" className="size-3.5" />}
              {tag}
            </label>
          );
        })}
      </div>
    </FieldSet>
  );
}

const chipWidths = ["w-24", "w-16", "w-28", "w-20", "w-24", "w-14", "w-20"];

/** Grey chips in place of the Tags, for a screen that says it is loading. */
export function TagChipShapes() {
  return (
    <div className="flex flex-wrap gap-2">
      {chipWidths.map((width, chip) => (
        <Skeleton key={chip} className={`bg-muted h-7 rounded-full ${width}`} />
      ))}
    </div>
  );
}
