import { mayAddAQuestion, type Viewer } from "@iqb/shared";
import type { LinkProps } from "@tanstack/react-router";
import {
  Building2Icon,
  ClipboardCheckIcon,
  FileTextIcon,
  HouseIcon,
  LibraryIcon,
  SquarePlusIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export const pageGroups = ["Questions", "Review", "Administration"] as const;

type AppPage = {
  id: string;
  to: NonNullable<LinkProps["to"]>;
  name: string;
  icon: LucideIcon;
  group: (typeof pageGroups)[number];
  /** Hiding a page keeps nobody out: the API refuses it anyway. */
  shownTo: (viewer: Viewer) => boolean;
  /** Marked as the current page only at its own address, not on the pages under it. */
  exact?: true;
};

const everyone = () => true;
const aReviewer = (viewer: Viewer) => viewer.role === "reviewer";
const anAdministrator = (viewer: Viewer) => viewer.isAdministrator;

/** The one list the sidebar, Home's shortcuts and the trail back from a page all read, so
 * they cannot get out of sync. */
export const appPages = [
  {
    id: "home",
    to: "/",
    name: "Home",
    icon: HouseIcon,
    group: "Questions",
    shownTo: everyone,
    exact: true,
  },
  {
    id: "browse",
    to: "/questions",
    name: "Browse",
    icon: LibraryIcon,
    group: "Questions",
    shownTo: everyone,
    exact: true,
  },
  {
    id: "add-a-question",
    to: "/questions/new",
    name: "Add a Question",
    icon: SquarePlusIcon,
    group: "Questions",
    shownTo: mayAddAQuestion,
  },
  {
    id: "your-questions",
    to: "/questions/own",
    name: "Your Questions",
    icon: FileTextIcon,
    group: "Questions",
    shownTo: mayAddAQuestion,
  },
  {
    id: "review-queue",
    to: "/review",
    name: "Review queue",
    icon: ClipboardCheckIcon,
    group: "Review",
    shownTo: aReviewer,
  },
  {
    id: "role-requests",
    to: "/administration/role-requests",
    name: "Role Requests",
    icon: UserPlusIcon,
    group: "Administration",
    shownTo: anAdministrator,
  },
  {
    id: "viewers",
    to: "/administration/viewers",
    name: "Viewers",
    icon: UsersIcon,
    group: "Administration",
    shownTo: anAdministrator,
  },
  {
    id: "clients",
    to: "/administration/clients",
    name: "Clients",
    icon: Building2Icon,
    group: "Administration",
    shownTo: anAdministrator,
  },
] as const satisfies readonly AppPage[];

export type ShownPage = (typeof appPages)[number];
export type PageId = ShownPage["id"];

export function pagesShownTo(viewer: Viewer): ShownPage[] {
  return appPages.filter((page) => page.shownTo(viewer));
}

export function pageById(id: PageId): ShownPage {
  // Every id is one of the pages in the list, so one is always found.
  return appPages.find((page) => page.id === id)!;
}

/** Home shows a page's waiting work to whoever the page is shown to, so the two agree. */
export function isPageShownTo(viewer: Viewer, id: PageId): boolean {
  return pageById(id).shownTo(viewer);
}
