import { createLink } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import type { ComponentProps } from "react";

function SectionAnchor({ children, ...props }: ComponentProps<"a">) {
  return (
    <a
      {...props}
      className="text-foreground inline-flex items-center gap-1 text-[15px] font-semibold whitespace-nowrap hover:underline"
    >
      {children}
      <ArrowRightIcon aria-hidden="true" className="size-4" />
    </a>
  );
}

/** The link at the right of a section's heading, such as "See them all". */
export const SectionLink = createLink(SectionAnchor);
