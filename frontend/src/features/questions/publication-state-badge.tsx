import type { PublicationState } from "@iqb/shared";
import type { VariantProps } from "class-variance-authority";
import { ClockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { publicationStateWording } from "@/features/questions/publication-state-wording";
import { Badge, type badgeVariants } from "@/ui/shadcn/badge";

type BadgeLook = {
  variant: VariantProps<typeof badgeVariants>["variant"];
  className?: string;
  icon?: ReactNode;
};

// Published has no colour, because it is the normal state.
const lookOf: Record<PublicationState, BadgeLook> = {
  pending: {
    variant: "outline",
    className: "border-pending-border bg-pending text-pending-foreground",
    icon: <ClockIcon aria-hidden="true" />,
  },
  published: { variant: "outline" },
  rejected: {
    variant: "outline",
    className: "border-transparent bg-rejected text-rejected-foreground",
  },
};

export function PublicationStateBadge({ state }: { state: PublicationState }) {
  const { variant, className, icon } = lookOf[state];
  return (
    <Badge variant={variant} className={className}>
      {icon}
      {publicationStateWording[state].name}
    </Badge>
  );
}
