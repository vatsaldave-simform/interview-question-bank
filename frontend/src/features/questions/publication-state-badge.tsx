import type { PublicationState } from "@iqb/shared";
import type { VariantProps } from "class-variance-authority";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { Badge, type badgeVariants } from "@/ui/shadcn/badge";

type BadgeLook = { variant: VariantProps<typeof badgeVariants>["variant"]; className?: string };

// Published has no colour, because it is the normal state.
const lookOf: Record<PublicationState, BadgeLook> = {
  pending: {
    variant: "outline",
    className: "bg-pending text-pending-foreground border-transparent",
  },
  published: { variant: "outline" },
  rejected: { variant: "destructive" },
};

export function PublicationStateBadge({ state }: { state: PublicationState }) {
  return <Badge {...lookOf[state]}>{publicationStateWording[state].name}</Badge>;
}
