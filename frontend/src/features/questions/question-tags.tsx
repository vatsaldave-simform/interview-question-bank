import type { QuestionTag } from "@iqb/shared";
import { Badge } from "@/ui/shadcn/badge";

export function QuestionTags({ tags }: { tags: readonly QuestionTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {tags.map(({ category, tag }) => (
        <li key={`${category}:${tag}`}>
          <Badge variant="secondary" title={category}>
            {tag}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
