import type { CategoryWithTags } from "@iqb/shared";
import { Checkbox } from "@/ui/shadcn/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/ui/shadcn/field";

type CategoryTagsProps = {
  /** Keeps each checkbox's id apart from the same Tag's checkbox elsewhere on the page. */
  idPrefix: string;
  category: CategoryWithTags;
  chosen: readonly string[];
  onChange: (tags: string[]) => void;
};

/** One Category's Tags as checkboxes, several of which may be ticked at once. */
export function CategoryTags({ idPrefix, category, chosen, onChange }: CategoryTagsProps) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{category.displayName}</FieldLegend>
      {/* The bulk bank puts dozens of Tags in one Category, and an unbounded list would push
          everything else off the screen. */}
      <FieldGroup data-slot="checkbox-group" className="max-h-60 overflow-y-auto">
        {category.tags.map((tag) => {
          const id = `${idPrefix}-${category.name}-${tag}`;
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
