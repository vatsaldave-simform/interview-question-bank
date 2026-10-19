import { Link, type LinkProps } from "@tanstack/react-router";
import { Fragment } from "react";
import { pageById, type PageId } from "@/platform/app-pages";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/ui/shadcn/breadcrumb";

/** A page from the sidebar's list takes the sidebar's name for it. */
export type StepBack = { page: PageId } | { name: string; link: LinkProps };

export type Trail = {
  /** The pages above this one, the first one first. */
  back: readonly StepBack[];
  /** This page, which is the last step and not a link. */
  here: string;
};

type Step = { name: string; link?: LinkProps };

const longestNameInTrail = 48;

/** Cut at a word, so a long Question does not push the trail onto a second line. */
function cutShort(name: string): string {
  if (name.length <= longestNameInTrail) return name;
  const cut = name.slice(0, longestNameInTrail);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function asLink(step: StepBack): Step {
  if (!("page" in step)) return step;
  const page = pageById(step.page);
  return { name: page.name, link: { to: page.to } };
}

export function PageTrail({ back, here }: Trail) {
  const steps: Step[] = [...back.map(asLink), { name: here }];
  // Only the longest name gives way on a narrow screen, so "Browse" or "Edit" is never cut.
  const givesWay = steps.reduce(
    (longest, { name }, index) => (name.length > steps[longest]!.name.length ? index : longest),
    0,
  );

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1">
        {steps.map(({ name, link }, index) => {
          const shrinks = index === givesWay;
          const shown = cutShort(name);
          const step = {
            title: shrinks || shown !== name ? name : undefined,
            className: shrinks ? "truncate" : "whitespace-nowrap",
          };
          return (
            <Fragment key={index}>
              {index > 0 && <BreadcrumbSeparator>›</BreadcrumbSeparator>}
              <BreadcrumbItem className={shrinks ? "min-w-0" : "shrink-0"}>
                {link === undefined ? (
                  <BreadcrumbPage {...step} className={`${step.className} font-medium`}>
                    {shown}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild {...step} className={`${step.className} hover:underline`}>
                    <Link {...link}>{shown}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
