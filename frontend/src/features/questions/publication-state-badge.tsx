import type { PublicationState } from "@iqb/shared";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { Badge } from "@/ui/shadcn/badge";

// Published has no colour, because it is the normal state.
const colourOf: Record<PublicationState, string> = {
  pending: "bg-pending text-pending-foreground border-transparent",
  published: "",
  rejected: "bg-destructive border-transparent text-white",
};

export function PublicationStateBadge({ state }: { state: PublicationState }) {
  return (
    <Badge variant="outline" className={colourOf[state]}>
      {publicationStateWording[state].name}
    </Badge>
  );
}
