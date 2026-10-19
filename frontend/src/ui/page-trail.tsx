import { Link, type LinkProps } from "@tanstack/react-router";
import { Fragment } from "react";
import { appPages, type PageId } from "@/platform/app-pages";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/ui/shadcn/breadcrumb";

/** A page from the sidebar's list, named as the sidebar names it, or any other page. */
type StepBack = { page: PageId } | { name: string; link: LinkProps };

export type Trail = {
  /** The pages above this one, the first one first. */
  back: readonly StepBack[];
  /** This page, which is the last step and not a link. */
  here: string;
};

const longestName = 48;

/** Cut at a word, so a long Question does not push the trail onto a second line. */
function CutShort({ name }: { name: string }) {
  if (name.length <= longestName) return name;
  const cut = name.slice(0, longestName);
  const lastSpace = cut.lastIndexOf(" ");
  const wholeWords = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return <span title={name}>{`${wholeWords.trimEnd()}…`}</span>;
}

function named(step: StepBack): { name: string; link: LinkProps } {
  if (!("page" in step)) return step;
  const page = appPages.find(({ id }) => id === step.page)!;
  return { name: page.name, link: { to: page.to } };
}

/** The way back from a deep page. */
export function PageTrail({ back, here }: Trail) {
  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1">
        {back.map(named).map(({ name, link }, index) => (
          <Fragment key={index}>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink asChild className="whitespace-nowrap hover:underline">
                <Link {...link}>
                  <CutShort name={name} />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>›</BreadcrumbSeparator>
          </Fragment>
        ))}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate font-medium">
            <CutShort name={here} />
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
