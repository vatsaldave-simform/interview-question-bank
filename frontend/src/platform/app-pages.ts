import type { Viewer } from "@iqb/shared";
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
const anyoneButAReader = (viewer: Viewer) => viewer.role !== "reader";
const aReviewer = (viewer: Viewer) => viewer.role === "reviewer";
const anAdministrator = (viewer: Viewer) => viewer.isAdministrator;

/** The one list the sidebar and Home's shortcuts both read, so they cannot get out of sync. */
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
    shownTo: anyoneButAReader,
  },
  {
    id: "your-questions",
    to: "/questions/own",
    name: "Your Questions",
    icon: FileTextIcon,
    group: "Questions",
    shownTo: anyoneButAReader,
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
